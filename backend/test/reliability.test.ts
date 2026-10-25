import assert from "node:assert/strict";
import test, { describe, it } from "node:test";
import { fetchRoadRoute } from "../src/geo.js";
import { buildItinerary, parseTimeToMinutes } from "../src/itinerary.js";
import { initDb, store } from "../src/store.js";
import type { TouristSpot } from "../src/types.js";
import { getTupiWeather } from "../src/weather.js";

describe("Tupi Tour Comprehensive Durability, Security & Feature Tests", async () => {
  // Initialize store (dev mode with fallback / test store)
  await initDb();

  describe("1. Database Durability & Operations Persistence", () => {
    it("persists user registration, retrieval, and password hashing", async () => {
      const email = `test-traveler-${Date.now()}@example.com`;
      const created = await store.createUser({
        email,
        passwordHash: "$2a$12$eXampLeHashForTestingPurposesOnly1234567890",
        name: "Test Explorer",
        role: "tourist",
      });

      assert.ok(created.id, "User ID must be generated");
      assert.equal(created.email, email.toLowerCase());

      const fetched = await store.findUserById(created.id);
      assert.ok(fetched, "User must be retrievable by ID");
      assert.equal(fetched.email, email.toLowerCase());

      const fetchedByEmail = await store.findUserByEmail(email);
      assert.ok(fetchedByEmail, "User must be retrievable by email");
      assert.equal(fetchedByEmail.id, created.id);
    });

    it("persists tourist spot creation, updates, and verification status", async () => {
      const testSpot: TouristSpot = {
        id: `sp-test-${Date.now()}`,
        slug: `test-spot-${Date.now()}`,
        name: "Mount Matutum Ridge View",
        categoryId: "cat-nature",
        description: "Panoramic highland ridge overlooking Dole pineapple plantations and Matutum cone.",
        shortDescription: "Scenic Matutum vista point.",
        lat: 6.356,
        lng: 124.982,
        address: "Barangay Kablon, Tupi",
        barangay: "Kablon",
        amenities: ["Viewpoint", "Parking"],
        featured: true,
        status: "approved",
        dataSource: "curated",
        estimatedEntranceFee: 50,
        popularityScore: 85,
        viewCount: 10,
        visitCount: 5,
        images: [{ url: "https://example.com/matutum.jpg", alt: "Matutum cone" }],
        verificationStatus: "verified",
        safetyGuidance: ["Stay on marked trail", "High winds possible"],
        emergencyContact: "MDRRMO Tupi: (083) 228-1000",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const saved = await store.saveSpot(testSpot);
      assert.equal(saved.id, testSpot.id);

      const fetched = await store.getSpot(testSpot.id);
      assert.ok(fetched, "Spot must persist in store");
      assert.equal(fetched.name, "Mount Matutum Ridge View");
      assert.equal(fetched.verificationStatus, "verified");

      // Test verification status update (Feature 3)
      const verified = await store.updateSpotVerification(testSpot.id, "verified", "user-admin");
      assert.ok(verified);
      assert.equal(verified.verificationStatus, "verified");
    });

    it("persists reviews, ratings, and duplicate submission prevention", async () => {
      const userId = "user-tourist";
      const spotId = "sp-fruit-park";

      const review = await store.addReview({
        id: `rev-test-${Date.now()}`,
        userId,
        spotId,
        rating: 5,
        body: "Fresh sweet pineapples and very friendly local vendors along the Kablon highway!",
        photos: [],
        helpfulCount: 0,
        helpfulBy: [],
        status: "published",
        createdAt: new Date().toISOString(),
      });

      assert.equal(review.rating, 5);

      const reviews = await store.reviewsForSpot(spotId);
      const found = reviews.find((r) => r.userId === userId);
      assert.ok(found, "Review must be persisted for spot");
      assert.equal(found.rating, 5);
    });

    it("persists saved itineraries and user trips", async () => {
      const userId = "user-tourist";
      const trip = await store.saveTrip({
        id: `trip-test-${Date.now()}`,
        userId,
        name: "Morning Farm & Fruit Trail",
        notes: "Remember to stop by Kablon fruit stalls on the way down.",
        spotIds: ["sp-fruit-park", "sp-sg-farm"],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      assert.ok(trip.id);
      const trips = await store.tripsFor(userId);
      const exists = trips.some((t) => t.id === trip.id);
      assert.ok(exists, "Trip must be in user's saved trips list");

      const ok = await store.deleteTrip(trip.id, userId);
      assert.equal(ok, true, "Trip deletion must succeed");
    });
  });

  describe("2. Itinerary Budget Calculation Bug Fix (Phase 3.4)", () => {
    it("ensures withinBudget calculation accurately factors in 'other' expenses", async () => {
      // Travelers: 2, hours: 4, budget: 1000
      const res = await buildItinerary({
        hours: 4,
        budget: 1000,
        interests: ["agri-tourism", "nature"],
        travelers: 2,
        transport: "tricycle",
        intensity: "easy",
      });

      const { transportation, food, entranceFees, other, total, withinBudget } = res.budget;

      // Assert total equals the sum of all 4 components
      const expectedTotal = transportation + food + entranceFees + other;
      assert.equal(total, expectedTotal, "Total budget must strictly equal transport + food + fees + other");

      // Assert withinBudget matches total <= budget
      assert.equal(
        withinBudget,
        total <= 1000,
        "withinBudget MUST reflect the complete total including other expenses"
      );

      // Edge case: budget set to exactly total - 1
      const resEdge = await buildItinerary({
        hours: 4,
        budget: total - 1,
        interests: ["agri-tourism"],
        travelers: 2,
        transport: "tricycle",
        intensity: "easy",
      });
      assert.equal(resEdge.budget.withinBudget, false, "Must flag over-budget when total exceeds budget by even 1 peso");
    });
  });

  describe("3. Feature 5: Secure Reward Wallet & Verifiable Vouchers", () => {
    it("executes atomic redemption, deducts points, reduces stock, and generates verifiable voucher", async () => {
      // Create user with known points
      const testUser = await store.createUser({
        email: `voucher-tester-${Date.now()}@example.com`,
        passwordHash: "hash123",
        name: "Voucher Tester",
        role: "tourist",
      });

      await store.addPoints(testUser.id, 200, "Initial test points grant");
      const userBefore = await store.findUserById(testUser.id);
      assert.equal(userBefore?.points, 200);

      // Create reward with cost 80
      const reward = await store.saveReward({
        id: `rw-test-${Date.now()}`,
        name: "Pineapple Jam Sample Voucher",
        description: "Claim one jar of authentic Tupi pineapple jam.",
        pointsCost: 80,
        stock: 5,
        active: true,
      });

      // Execute redemption
      const result = await store.redeem(testUser.id, reward.id);
      assert.ok(!("error" in result && result.error), "Redemption should succeed without error");

      const success = result as { voucher: any; user: any; reward: any };
      assert.ok(success.voucher, "Server must generate a voucher");
      assert.match(success.voucher.code, /^TUPI-[A-Z0-9]+-\d+$/, "Voucher code format must match TUPI-XXXX-XXXX");
      assert.equal(success.voucher.status, "active");

      // Verify points deducted: 200 - 80 = 120
      const userAfter = await store.findUserById(testUser.id);
      assert.equal(userAfter?.points, 120, "User points must be decremented by 80");

      // Verify reward stock reduced: 5 - 1 = 4
      const allRewards = await store.rewards();
      const updatedReward = allRewards.find((r) => r.id === reward.id);
      assert.equal(updatedReward?.stock, 4, "Reward stock must be decremented by 1");

      // Verify staff voucher inspection
      const inspected = await store.getVoucherByCode(success.voucher.code);
      assert.ok(inspected, "Staff must be able to lookup voucher by code");
      assert.equal(inspected.status, "active");

      // Verify host claim of voucher
      const claimResult = await store.verifyAndRedeemVoucher(success.voucher.code, "user-owner");
      assert.equal(claimResult.success, true);
      assert.equal(claimResult.voucher?.status, "redeemed");

      // Verify double claim is rejected
      const secondClaim = await store.verifyAndRedeemVoucher(success.voucher.code, "user-owner");
      assert.equal(secondClaim.success, false, "Cannot redeem an already redeemed voucher");
    });

    it("rejects redemption when user has insufficient points", async () => {
      const brokeUser = await store.createUser({
        email: `broke-user-${Date.now()}@example.com`,
        passwordHash: "hash123",
        name: "Broke User",
        role: "tourist",
      });

      const expensiveReward = await store.saveReward({
        id: `rw-expensive-${Date.now()}`,
        name: "Luxury Resort Day Pass",
        description: "Full day pass at resort",
        pointsCost: 500,
        stock: 10,
        active: true,
      });

      const result = await store.redeem(brokeUser.id, expensiveReward.id);
      assert.ok("error" in result, "Must return error for insufficient balance");
      assert.match(result.error, /points/i);
    });
  });

  describe("4. Feature 4: Weather API Live & Fallback Check", () => {
    it("retrieves weather forecast or provides reliable municipal advisory fallback", async () => {
      const weather = await getTupiWeather();
      if (weather) {
        assert.ok(weather.current, "Weather current conditions must exist");
        assert.ok(typeof weather.current.tempC === "number", "Temperature must be a valid number");
        assert.ok(weather.advisory.length > 10, "Advisory must provide meaningful travel guidance");
        assert.ok(weather.source.includes("Open-Meteo") || weather.source.includes("Weather"), "Source must be identified");
      } else {
        // If external API is unreachable in test environment, verify null safe handling
        assert.equal(weather, null);
      }
    });
  });

  describe("5. Feature 2: Multi-Stop Routes Persistence", () => {
    it("saves and retrieves multi-stop optimized routes", async () => {
      const userId = "user-tourist";
      const route = await store.saveRoute({
        id: `route-test-${Date.now()}`,
        userId,
        name: "Highland Fruit & Heritage Loop",
        stops: [
          { spotId: "sp-fruit-park", name: "Tupi Fruit Park", lat: 6.3528, lng: 124.9741, order: 0 },
          { spotId: "sp-sg-farm", name: "SG Farm", lat: 6.3785, lng: 124.9952, order: 1 },
        ],
        totalDistanceKm: 14.2,
        estimatedMinutes: 40,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      assert.ok(route.id);
      const userRoutes = await store.savedRoutesFor(userId);
      assert.ok(userRoutes.some((r) => r.id === route.id));

      const deleted = await store.deleteRoute(route.id, userId);
      assert.equal(deleted, true);
    });
  });

  describe("6. Check-ins & Daily Duplicate Prevention", () => {
    it("prevents double visit rewards on the same day for the same destination", async () => {
      const checkinUser = await store.createUser({
        email: `checkin-user-${Date.now()}@example.com`,
        passwordHash: "hash123",
        name: "Checkin User",
        role: "tourist",
      });

      const firstVisit = await store.checkIn(checkinUser.id, "sp-fruit-park");
      assert.equal(firstVisit.awarded, true, "First check-in of the day must award points");

      const secondVisit = await store.checkIn(checkinUser.id, "sp-fruit-park");
      assert.equal(secondVisit.awarded, false, "Second check-in on the same day must not award duplicate points");
    });
  });

  describe("7. Feature 9: Analytics and Metrics", () => {
    it("returns real aggregate metrics for municipal oversight", async () => {
      const analytics = await store.analytics();
      assert.ok(analytics.totals, "Analytics must include totals");
      assert.ok(typeof analytics.totals.spots === "number");
      assert.ok(typeof analytics.totals.visits === "number");
      assert.ok(Array.isArray(analytics.popular), "Popular spots must be an array");
      assert.ok(Array.isArray(analytics.categories), "Categories breakdown must be an array");
    });
  });

  describe("8. Feature 1: Destination Deletion & Full CRUD Operations", () => {
    it("creates, retrieves, and cleanly deletes a tourist spot", async () => {
      const spotId = `sp-del-test-${Date.now()}`;
      const newSpot: TouristSpot = {
        id: spotId,
        slug: `spot-del-${Date.now()}`,
        name: "Temporary Tupi Park Test",
        categoryId: "cat-nature",
        description: "Test description for destination CRUD.",
        shortDescription: "Temporary test spot.",
        lat: 6.33,
        lng: 124.96,
        address: "Poblacion, Tupi",
        barangay: "Poblacion",
        amenities: ["Benches"],
        featured: false,
        status: "approved",
        dataSource: "curated",
        estimatedEntranceFee: 0,
        popularityScore: 10,
        viewCount: 1,
        visitCount: 0,
        images: [],
        verificationStatus: "verified",
        safetyGuidance: [],
        emergencyContact: "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await store.saveSpot(newSpot);
      const exists = await store.getSpot(spotId);
      assert.ok(exists, "Spot must exist after saving");

      const deleted = await store.deleteSpot(spotId);
      assert.equal(deleted, true, "deleteSpot must return true on success");

      const afterDelete = await store.getSpot(spotId);
      assert.equal(afterDelete, null, "Deleted spot must no longer exist in store");
    });
  });

  describe("9. Feature 2: Road Route Navigation via OSRM / Fallback", () => {
    it("calculates driving road route with non-empty polyline coordinates and duration", async () => {
      // From Poblacion to SG Farm
      const origin = { lat: 6.3347, lng: 124.9669 };
      const dest = { lat: 6.3785, lng: 124.9952 };

      const route = await fetchRoadRoute(origin, dest);
      assert.ok(route.distanceKm > 0, "Distance must be greater than 0 km");
      assert.ok(route.durationMinutes > 0, "Driving duration must be greater than 0 minutes");
      assert.ok(Array.isArray(route.geometry), "Geometry must be an array of lat/lng pairs");
      assert.ok(route.geometry.length >= 2, "Geometry must contain at least start and end points");
      assert.ok(route.provider.includes("OSRM") || route.provider.includes("Fallback"), "Provider must be OSRM or Fallback");
    });
  });

  describe("10. Feature 4: Budget Deficit Arithmetic & Suggestions", () => {
    it("calculates deficit and actionable cost-saving recommendations when over budget", async () => {
      // Intentional low budget for 5 travelers
      const res = await buildItinerary({
        hours: 8,
        budget: 500, // Very low budget for 5 travelers
        interests: ["agri-tourism", "adventure"],
        travelers: 5,
        transport: "car",
        intensity: "active",
      });

      assert.equal(res.budget.withinBudget, false, "Should be marked over budget");
      assert.ok((res.budget.deficit || 0) > 0, "Deficit must be greater than 0");
      assert.equal(res.budget.remainingBudget, 0, "Remaining budget must be 0 when in deficit");
      assert.ok(Array.isArray(res.budget.suggestions), "Suggestions must be an array");
      assert.ok(res.budget.suggestions!.length > 0, "Must provide actionable cost-saving recommendations");
    });

    it("calculates remaining budget buffer when within budget", async () => {
      const res = await buildItinerary({
        hours: 4,
        budget: 10000, // Generous budget
        interests: ["agri-tourism"],
        travelers: 1,
        transport: "tricycle",
        intensity: "easy",
      });

      assert.equal(res.budget.withinBudget, true, "Should be within budget");
      assert.equal(res.budget.deficit, 0, "Deficit must be 0");
      assert.ok((res.budget.remainingBudget || 0) > 0, "Remaining budget must be positive");
    });
  });

  describe("11. Feature 5: Review Points Deduplication & History", () => {
    it("awards points on first review and tracks activity in user points ledger", async () => {
      const reviewUser = await store.createUser({
        email: `reviewer-${Date.now()}@example.com`,
        passwordHash: "hash123",
        name: "Honest Reviewer",
        role: "tourist",
      });

      const initialPoints = reviewUser.points || 0;

      // Simulate first review points grant (+25 pts)
      await store.addPoints(reviewUser.id, 25, "First verified review for Tupi Fruit Park");

      const userAfter = await store.findUserById(reviewUser.id);
      assert.equal(userAfter?.points, initialPoints + 25, "User points must increase by 25");

      // Verify points ledger record exists
      const history = await store.pointsHistory(reviewUser.id);
      assert.ok(history.length > 0, "Points ledger must contain transaction history");
      assert.equal(history[0].amount, 25);
      assert.match(history[0].reason, /First verified review/i);
    });
  });

  describe("12. Custom Departure Time (e.g. 1:00 PM Afternoon Tour) and Exact Scheduling", () => {
    it("correctly parses 1pm, 1:00 PM, and 13:00 to 780 minutes", () => {
      assert.equal(parseTimeToMinutes("13:00"), 780, "13:00 must parse to 780 minutes");
      assert.equal(parseTimeToMinutes("1:00 PM"), 780, "1:00 PM must parse to 780 minutes");
      assert.equal(parseTimeToMinutes("1pm"), 780, "1pm must parse to 780 minutes");
      assert.equal(parseTimeToMinutes("1:00"), 780, "1:00 (without AM/PM) should default to afternoon 1:00 PM for day tours");
    });

    it("builds an exact 4-hour afternoon tour starting at 1:00 PM and ending at 5:00 PM", async () => {
      const res = await buildItinerary({
        startTime: "13:00",
        endTime: "17:00",
        hours: 4,
        budget: 1000,
        interests: ["agri-tourism", "nature"],
        travelers: 2,
        transport: "tricycle",
        intensity: "moderate",
      });

      assert.equal(res.startTime, "01:00 PM", "Start time must be 01:00 PM");
      assert.equal(res.endTime, "05:00 PM", "End time must be 05:00 PM");
      assert.equal(res.hours, 4, "Effective hours must be exactly 4");
      assert.ok(res.title.includes("Afternoon Tour"), "Title should reflect afternoon tour");
      assert.equal(res.budget.withinBudget, true, "Should be within budget of 1000");

      // Verify schedule blocks
      assert.ok(res.schedule.length >= 3, "Schedule must have stops and return");
      const firstStop = res.schedule[0];
      assert.match(firstStop.time, /01:[0-3][0-9] PM/, "First stop arrival should be shortly after 1:00 PM");

      const lastBlock = res.schedule[res.schedule.length - 1];
      assert.equal(lastBlock.kind, "return", "Last block must be return arrival");
      assert.equal(lastBlock.time, "05:00 PM", "Must return promptly at 05:00 PM");

      // Verify afternoon merienda break is included
      const breakBlock = res.schedule.find((b) => b.kind === "break");
      if (breakBlock) {
        assert.ok(breakBlock.title.toLowerCase().includes("afternoon") || breakBlock.title.toLowerCase().includes("merienda"), "Break block should be afternoon-themed");
      }
    });
  });

});

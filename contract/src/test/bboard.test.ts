// This file is part of midnightntwrk/example-bboard.
// Copyright (C) 2025 Midnight Foundation
// SPDX-License-Identifier: Apache-2.0
// Licensed under the Apache License, Version 2.0 (the "License");
// You may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { BBoardSimulator } from "./bboard-simulator.js";
import {
  NetworkId,
  setNetworkId,
} from "@midnight-ntwrk/midnight-js-network-id";
import { describe, it, expect } from "vitest";
import { randomBytes } from "./utils.js";

setNetworkId("undeployed" as NetworkId);

describe("Multi-Post BBoard smart contract", () => {
  it("generates initial ledger state deterministically", () => {
    const key = randomBytes(32);
    const simulator0 = new BBoardSimulator(key);
    const simulator1 = new BBoardSimulator(key);
    expect(simulator0.getLedger()).toEqual(simulator1.getLedger());
  });

  it("properly initializes ledger state and private state", () => {
    const key = randomBytes(32);
    const simulator = new BBoardSimulator(key);
    const initialLedgerState = simulator.getLedger();
    expect(initialLedgerState.sequence).toEqual(1n);
    expect(initialLedgerState.postCounter).toEqual(0);
    expect(initialLedgerState.posts.size).toEqual(0);
    const initialPrivateState = simulator.getPrivateState();
    expect(initialPrivateState).toEqual({ secretKey: key });
  });

  // ========== Test 1: Post multiple messages from different accounts ==========
  it("lets multiple users post messages (Test 1: multi-post)", () => {
    const userA = randomBytes(32);
    const userB = randomBytes(32);
    const simulator = new BBoardSimulator(userA);

    // User A posts first message
    const message1 = "First post by User A";
    const postId1 = simulator.post(message1);
    expect(postId1).toEqual(0);

    // User A posts second message
    const message2 = "Second post by User A";
    const postId2 = simulator.post(message2);
    expect(postId2).toEqual(1);

    // Switch to User B and post
    simulator.switchUser(userB);
    const message3 = "Post by User B";
    const postId3 = simulator.post(message3);
    expect(postId3).toEqual(2);

    // Verify the state contains all 3 posts
    const ledgerState = simulator.getLedger();
    expect(ledgerState.postCounter).toEqual(3);
    expect(ledgerState.posts.size).toEqual(3);

    // Verify post contents
    const post0 = ledgerState.posts.get(0);
    expect(post0).toBeDefined();
    expect(post0!.message).toEqual(message1);

    const post1 = ledgerState.posts.get(1);
    expect(post1).toBeDefined();
    expect(post1!.message).toEqual(message2);

    const post2 = ledgerState.posts.get(2);
    expect(post2).toBeDefined();
    expect(post2!.message).toEqual(message3);
  });

  // ========== Test 2: Valid takedown by owner ==========
  it("lets owner take down their own post (Test 2: valid takedown)", () => {
    const userA = randomBytes(32);
    const simulator = new BBoardSimulator(userA);

    // User A posts a message
    const message = "This post will be deleted";
    const postId = simulator.post(message);
    expect(simulator.getLedger().posts.size).toEqual(1);

    // User A takes down their post
    simulator.takeDown(postId);

    // Verify the post is gone
    const ledgerState = simulator.getLedger();
    expect(ledgerState.posts.size).toEqual(0);
    expect(ledgerState.posts.get(postId)).toBeUndefined();
  });

  // ========== Test 3: Invalid takedown by non-owner (should fail) ==========
  it("doesn't let users take down someone else's post (Test 3: invalid takedown)", () => {
    const userA = randomBytes(32);
    const userB = randomBytes(32);
    const simulator = new BBoardSimulator(userA);

    // User A posts a message
    const message = "Only User A can delete this";
    const postId = simulator.post(message);

    // Switch to User B and try to take down User A's post
    simulator.switchUser(userB);
    expect(() => simulator.takeDown(postId)).toThrow(
      "failed assert: Only the post owner can take down this post",
    );

    // Verify the post still exists
    const ledgerState = simulator.getLedger();
    expect(ledgerState.posts.size).toEqual(1);
    expect(ledgerState.posts.get(postId)!.message).toEqual(message);
  });

  // ========== Test 4: Exceed MAX_POSTS limit (should fail) ==========
  it("rejects posts when MAX_POSTS limit is reached (Test 4: exceed limit)", () => {
    const simulator = new BBoardSimulator(randomBytes(32));
    const maxPosts = simulator.getMaxPosts();

    // Post messages up to the limit
    for (let i = 0; i < maxPosts; i++) {
      simulator.post(`Post number ${i + 1}`);
    }

    // Verify we have MAX_POSTS posts
    expect(simulator.getLedger().posts.size).toEqual(maxPosts);

    // Try to post one more - should fail
    expect(() => simulator.post("One post too many")).toThrow(
      "failed assert: Maximum number of posts reached",
    );

    // Verify the count hasn't changed
    expect(simulator.getLedger().posts.size).toEqual(maxPosts);
  });

  // ========== Additional Tests ==========

  it("allows posting after taking down a post", () => {
    const simulator = new BBoardSimulator(randomBytes(32));

    // Post and take down
    const postId = simulator.post("Temporary message");
    simulator.takeDown(postId);

    // Post again
    const message = "New message after deletion";
    const newPostId = simulator.post(message);

    const ledgerState = simulator.getLedger();
    expect(ledgerState.posts.size).toEqual(1);
    expect(ledgerState.posts.get(newPostId)!.message).toEqual(message);
    // New post ID should be higher than the deleted one
    expect(newPostId).toBeGreaterThan(postId);
  });

  it("throws when trying to take down non-existent post", () => {
    const simulator = new BBoardSimulator(randomBytes(32));

    // Try to take down a post that doesn't exist
    expect(() => simulator.takeDown(999)).toThrow(
      "failed assert: Post does not exist",
    );
  });

  it("maintains correct post ownership across multiple users", () => {
    const userA = randomBytes(32);
    const userB = randomBytes(32);
    const simulator = new BBoardSimulator(userA);

    // User A posts
    const postIdA = simulator.post("User A's post");
    const ownerA = simulator.publicKey();

    // Switch to User B and post
    simulator.switchUser(userB);
    const postIdB = simulator.post("User B's post");
    const ownerB = simulator.publicKey();

    // Verify ownership in ledger
    const ledgerState = simulator.getLedger();
    expect(ledgerState.posts.get(postIdA)!.owner).toEqual(ownerA);
    expect(ledgerState.posts.get(postIdB)!.owner).toEqual(ownerB);

    // User B can take down their own post
    simulator.takeDown(postIdB);
    expect(simulator.getLedger().posts.size).toEqual(1);

    // User B cannot take down User A's post
    expect(() => simulator.takeDown(postIdA)).toThrow(
      "failed assert: Only the post owner can take down this post",
    );
  });

  it("allows re-posting after reaching and clearing limit", () => {
    const simulator = new BBoardSimulator(randomBytes(32));
    const maxPosts = simulator.getMaxPosts();

    // Fill the board
    const postIds: number[] = [];
    for (let i = 0; i < maxPosts; i++) {
      postIds.push(simulator.post(`Post ${i}`));
    }

    // Take down one post
    simulator.takeDown(postIds[0]);

    // Now we should be able to post again
    const newPostId = simulator.post("New post after clearing one slot");
    expect(simulator.getLedger().posts.size).toEqual(maxPosts);
    expect(simulator.getLedger().posts.get(newPostId)).toBeDefined();
  });
});

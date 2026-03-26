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

import {
  type CircuitContext,
  QueryContext,
  sampleContractAddress,
  convertFieldToBytes,
  createConstructorContext,
  CostModel,
} from "@midnight-ntwrk/compact-runtime";
import {
  Contract,
  type Ledger,
  ledger,
  MAX_POSTS,
} from "../managed/bboard/contract/index.js";
import { type BBoardPrivateState, witnesses } from "../witnesses.js";

/**
 * Serves as a testbed to exercise the multi-post contract in tests
 */
export class BBoardSimulator {
  readonly contract: Contract<BBoardPrivateState>;
  circuitContext: CircuitContext<BBoardPrivateState>;

  constructor(secretKey: Uint8Array) {
    this.contract = new Contract<BBoardPrivateState>(witnesses);
    const {
      currentPrivateState,
      currentContractState,
      currentZswapLocalState,
    } = this.contract.initialState(
      createConstructorContext({ secretKey }, "0".repeat(64)),
    );
    this.circuitContext = {
      currentPrivateState,
      currentZswapLocalState,
      costModel: CostModel.initialCostModel(),
      currentQueryContext: new QueryContext(
        currentContractState.data,
        sampleContractAddress(),
      ),
    };
  }

  /**
   * Switch to a different secret key for a different user
   */
  public switchUser(secretKey: Uint8Array) {
    this.circuitContext.currentPrivateState = {
      secretKey,
    };
  }

  public getLedger(): Ledger {
    return ledger(this.circuitContext.currentQueryContext.state);
  }

  public getPrivateState(): BBoardPrivateState {
    return this.circuitContext.currentPrivateState;
  }

  /**
   * Post a new message to the board
   * @returns The ID of the newly created post
   */
  public post(message: string): number {
    const result = this.contract.impureCircuits.post(
      this.circuitContext,
      message,
    );
    this.circuitContext = result.context;
    return result.result;
  }

  /**
   * Take down (delete) a post by ID
   * @param postId The ID of the post to delete
   */
  public takeDown(postId: number): void {
    this.circuitContext = this.contract.impureCircuits.takeDown(
      this.circuitContext,
      postId,
    ).context;
  }

  /**
   * Compute the public key for the current user
   */
  public publicKey(): Uint8Array {
    const sequence = convertFieldToBytes(
      32,
      this.getLedger().sequence,
      "bboard-simulator.ts",
    );
    return this.contract.circuits.publicKey(
      this.circuitContext,
      this.getPrivateState().secretKey,
      sequence,
    ).result;
  }

  /**
   * Get the maximum number of posts allowed
   */
  public getMaxPosts(): number {
    return MAX_POSTS;
  }
}

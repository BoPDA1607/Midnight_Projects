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

/**
 * Bulletin board common types and abstractions.
 *
 * @module
 */

import { type MidnightProviders } from '@midnight-ntwrk/midnight-js-types';
import { type FoundContract } from '@midnight-ntwrk/midnight-js-contracts';
import type { BBoardPrivateState, Contract, Witnesses } from '../../contract/src/index';

export const bboardPrivateStateKey = 'bboardPrivateState';
export type PrivateStateId = typeof bboardPrivateStateKey;

/**
 * The private states consumed throughout the application.
 *
 * @remarks
 * {@link PrivateStates} can be thought of as a type that describes a schema for all
 * private states for all contracts used in the application. Each key represents
 * the type of private state consumed by a particular type of contract.
 * The key is used by the deployed contract when interacting with a private state provider,
 * and the type (i.e., `typeof PrivateStates[K]`) represents the type of private state
 * expected to be returned.
 *
 * Since there is only one contract type for the bulletin board example, we only define a
 * single key/type in the schema.
 *
 * @public
 */
export type PrivateStates = {
  /**
   * Key used to provide the private state for {@link BBoardContract} deployments.
   */
  readonly bboardPrivateState: BBoardPrivateState;
};

/**
 * Represents a bulletin board contract and its private state.
 *
 * @public
 */
export type BBoardContract = Contract<BBoardPrivateState, Witnesses<BBoardPrivateState>>;

/**
 * The keys of the circuits exported from {@link BBoardContract}.
 *
 * @public
 */
export type BBoardCircuitKeys = Exclude<keyof BBoardContract['impureCircuits'], number | symbol>;

/**
 * The providers required by {@link BBoardContract}.
 *
 * @public
 */
export type BBoardProviders = MidnightProviders<BBoardCircuitKeys, PrivateStateId, BBoardPrivateState>;

/**
 * A {@link BBoardContract} that has been deployed to the network.
 *
 * @public
 */
export type DeployedBBoardContract = FoundContract<BBoardContract>;

/**
 * Represents a single post in the multi-post board.
 *
 * @public
 */
export type PostEntry = {
  /** The unique ID of the post */
  readonly id: number;
  /** The message content */
  readonly message: string;
  /** Whether the current user owns this post */
  readonly isOwner: boolean;
};

/**
 * A type that represents the derived combination of public (or ledger), and private state.
 * Now supports multiple posts instead of a single message.
 */
export type BBoardDerivedState = {
  /** The sequence counter for public key derivation */
  readonly sequence: bigint;
  /** Total number of posts ever created */
  readonly postCounter: number;
  /** Array of all active posts with ownership info */
  readonly posts: PostEntry[];
};

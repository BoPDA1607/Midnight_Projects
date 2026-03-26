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
 * Provides types and utilities for working with multi-post bulletin board contracts.
 *
 * @packageDocumentation
 */

import * as BBoard from '../../contract/src/managed/bboard/contract/index.js';

import { type ContractAddress, convertFieldToBytes } from '@midnight-ntwrk/compact-runtime';
import { type Logger } from 'pino';
import {
  type BBoardDerivedState,
  type BBoardContract,
  type BBoardProviders,
  type DeployedBBoardContract,
  type PostEntry,
  bboardPrivateStateKey,
} from './common-types.js';
import { CompiledBBoardContractContract } from '../../contract/src/index';
import * as utils from './utils/index.js';
import { deployContract, findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { combineLatest, map, tap, from, type Observable } from 'rxjs';
import { toHex } from '@midnight-ntwrk/midnight-js-utils';
import { BBoardPrivateState, createBBoardPrivateState } from '@midnight-ntwrk/bboard-contract';

/** @internal */

/**
 * An API for a deployed multi-post bulletin board.
 */
export interface DeployedBBoardAPI {
  readonly deployedContractAddress: ContractAddress;
  readonly state$: Observable<BBoardDerivedState>;

  post: (message: string) => Promise<number>;
  takeDown: (postId: number) => Promise<void>;
}

/**
 * Provides an implementation of {@link DeployedBBoardAPI} by adapting a deployed bulletin board
 * contract.
 *
 * @remarks
 * The `BBoardPrivateState` is managed at the DApp level by a private state provider. As such, this
 * private state is shared between all instances of {@link BBoardAPI}, and their underlying deployed
 * contracts. The private state defines a `'secretKey'` property that effectively identifies the current
 * user, and is used to determine if the current user is the owner of each post as the observable
 * contract state changes.
 *
 * In the future, Midnight.js will provide a private state provider that supports private state storage
 * keyed by contract address. This will remove the current workaround of sharing private state across
 * the deployed bulletin board contracts, and allows for a unique secret key to be generated for each bulletin
 * board that the user interacts with.
 */
export class BBoardAPI implements DeployedBBoardAPI {
  /** @internal */
  private constructor(
    public readonly deployedContract: DeployedBBoardContract,
    providers: BBoardProviders,
    private readonly logger?: Logger,
  ) {
    this.deployedContractAddress = deployedContract.deployTxData.public.contractAddress;
    this.state$ = combineLatest(
      [
        // Combine public (ledger) state with...
        providers.publicDataProvider.contractStateObservable(this.deployedContractAddress, { type: 'latest' }).pipe(
          map((contractState) => BBoard.ledger(contractState.data)),
          tap((ledgerState) =>
            logger?.trace({
              ledgerStateChanged: {
                ledgerState: {
                  postCounter: ledgerState.postCounter,
                  postsCount: ledgerState.posts.size,
                },
              },
            }),
          ),
        ),
        // ...private state...
        from(providers.privateStateProvider.get(bboardPrivateStateKey) as Promise<BBoardPrivateState>),
      ],
      // ...and combine them to produce the required derived state.
      (ledgerState, privateState) => {
        const hashedSecretKey = BBoard.pureCircuits.publicKey(
          privateState.secretKey,
          convertFieldToBytes(32, ledgerState.sequence, 'api/src/index.ts'),
        );
        const hashedSecretKeyHex = toHex(hashedSecretKey);

        // Convert Map<number, Post> to array of PostEntry with ownership info
        const posts: PostEntry[] = [];
        for (const [id, post] of ledgerState.posts.entries()) {
          posts.push({
            id,
            message: post.message,
            isOwner: toHex(post.owner) === hashedSecretKeyHex,
          });
        }

        // Sort posts by ID for consistent display
        posts.sort((a, b) => a.id - b.id);

        return {
          sequence: ledgerState.sequence,
          postCounter: ledgerState.postCounter,
          posts,
        };
      },
    );
  }

  /**
   * Gets the address of the current deployed contract.
   */
  readonly deployedContractAddress: ContractAddress;

  /**
   * Gets an observable stream of state changes based on the current public (ledger),
   * and private state data.
   */
  readonly state$: Observable<BBoardDerivedState>;

  /**
   * Attempts to post a new message to the multi-post bulletin board.
   *
   * @param message The message to post.
   * @returns The ID of the newly created post.
   *
   * @remarks
   * This method can fail during local circuit execution if the maximum number of posts
   * (MAX_POSTS) has been reached.
   */
  async post(message: string): Promise<number> {
    this.logger?.info(`postingMessage: ${message}`);

    const txData = await this.deployedContract.callTx.post(message);

    this.logger?.trace({
      transactionAdded: {
        circuit: 'post',
        txHash: txData.public.txHash,
        blockHeight: txData.public.blockHeight,
      },
    });

    // Return the post ID from the transaction result
    return txData.public.result as number;
  }

  /**
   * Attempts to take down (delete) a specific post from the bulletin board.
   *
   * @param postId The ID of the post to delete.
   *
   * @remarks
   * This method can fail during local circuit execution if:
   * - The post does not exist
   * - The current user is not the owner of the post
   */
  async takeDown(postId: number): Promise<void> {
    this.logger?.info(`takingDownMessage: postId=${postId}`);

    const txData = await this.deployedContract.callTx.takeDown(postId);

    this.logger?.trace({
      transactionAdded: {
        circuit: 'takeDown',
        txHash: txData.public.txHash,
        blockHeight: txData.public.blockHeight,
      },
    });
  }

  /**
   * Deploys a new multi-post bulletin board contract to the network.
   *
   * @param providers The bulletin board providers.
   * @param logger An optional 'pino' logger to use for logging.
   * @returns A `Promise` that resolves with a {@link BBoardAPI} instance that manages the newly deployed
   * {@link DeployedBBoardContract}; or rejects with a deployment error.
   */
  static async deploy(providers: BBoardProviders, logger?: Logger): Promise<BBoardAPI> {
    logger?.info('deployContract');

    const deployedBBoardContract = await deployContract(providers, {
      compiledContract: CompiledBBoardContractContract,
      privateStateId: bboardPrivateStateKey,
      initialPrivateState: await BBoardAPI.getPrivateState(providers),
    });

    logger?.trace({
      contractDeployed: {
        finalizedDeployTxData: deployedBBoardContract.deployTxData.public,
      },
    });

    return new BBoardAPI(deployedBBoardContract, providers, logger);
  }

  /**
   * Finds an already deployed bulletin board contract on the network, and joins it.
   *
   * @param providers The bulletin board providers.
   * @param contractAddress The contract address of the deployed bulletin board contract to search for and join.
   * @param logger An optional 'pino' logger to use for logging.
   * @returns A `Promise` that resolves with a {@link BBoardAPI} instance that manages the joined
   * {@link DeployedBBoardContract}; or rejects with an error.
   */
  static async join(providers: BBoardProviders, contractAddress: ContractAddress, logger?: Logger): Promise<BBoardAPI> {
    logger?.info({
      joinContract: {
        contractAddress,
      },
    });

    const deployedBBoardContract = await findDeployedContract<BBoardContract>(providers, {
      contractAddress,
      compiledContract: CompiledBBoardContractContract,
      privateStateId: bboardPrivateStateKey,
      initialPrivateState: await BBoardAPI.getPrivateState(providers),
    });

    logger?.trace({
      contractJoined: {
        finalizedDeployTxData: deployedBBoardContract.deployTxData.public,
      },
    });

    return new BBoardAPI(deployedBBoardContract, providers, logger);
  }

  private static async getPrivateState(providers: BBoardProviders): Promise<BBoardPrivateState> {
    const existingPrivateState = await providers.privateStateProvider.get(bboardPrivateStateKey);
    return existingPrivateState ?? createBBoardPrivateState(utils.randomBytes(32));
  }
}

/**
 * A namespace that represents the exports from the `'utils'` sub-package.
 *
 * @public
 */
export * as utils from './utils/index.js';

export * from './common-types.js';

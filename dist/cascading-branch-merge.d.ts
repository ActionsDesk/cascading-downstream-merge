import type { Octokit } from '@octokit/rest';
import { Endpoints } from '@octokit/types';
type GetRepositoryBranchesResponse = Endpoints['GET /repos/{owner}/{repo}/branches']['response']['data'];
/**
 * Merges all release branches by ascending order of their semantic version.
 *
 * @param prefixes The prefixes to filter branches by.
 * @param refBranch The branch to merge into the head branch.
 * @param headBranch The head branch to merge from.
 * @param baseBranch The base branch to merge into.
 * @param owner The owner of the repository.
 * @param repo The repository name.
 * @param octokit The octokit instance.
 * @param mergeOctokit The octokit instance to merge with.
 * @param pullNumber The pull request number.
 * @param actor The actor of the pull request.
 */
export declare function cascadingBranchMerge(prefixes: string[], refBranch: string, headBranch: string, baseBranch: string, owner: string, repo: string, octokit: InstanceType<typeof Octokit>, mergeOctokit: InstanceType<typeof Octokit>, pullNumber: number, actor: string): Promise<void>;
/**
 * Filters repository branches that start with a specific prefix, followed by a
 * forward slash (e.g. `release/`) and return an ordered list.
 *
 * Ordering is done by comparing the semantic version of the branches.
 *
 * @param prefix The prefix to filter branches by.
 * @param headBranch The head branch to merge from.
 * @param branches The list of branches in the repository.
 * @returns The ordered list of branches.
 */
export declare function getBranchMergeOrder(prefix: string, headBranch: string, branches: GetRepositoryBranchesResponse): string[];
/**
 * Compares the semantic versions of two branches.
 *
 * @param v1 The first version.
 * @param v2 The second version.
 * @returns A negative value if v1 is before (smaller than) v2, a positive value
 *          if v1 is after (bigger than) v2, or 0 if they are equal.
 */
export declare function isBiggerThan(v1: number[], v2: number[]): number;
/**
 * Translates the version string to an array of numbers, dropping any
 * non-numeric parts.
 *
 * E.g., "release/1.1-rc.1" -> [1,1,0,3,1]
 *
 * @param vStr The version string.
 * @returns The version as an array of numbers.
 */
export declare function semanticVersionToArray(vStr: string): number[];
export {};

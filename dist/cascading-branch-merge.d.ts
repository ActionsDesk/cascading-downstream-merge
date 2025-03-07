import type { Octokit } from '@octokit/rest';
import { Endpoints } from '@octokit/types';
type GetRepositoryBranchesResponse = Endpoints['GET /repos/{owner}/{repo}/branches']['response']['data'];
/**
 * Merges all release branches by ascending order of their semantic version.
 *
 * @param prefixes The prefixes to filter branches by.
 * @param refBranch The branch to merge into the head branch.
 * @param headBranch The head branch to merge from (e.g. feature/abc123).
 * @param baseBranch The base branch to merge into (e.g. release/2022.05.04).
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
export {};

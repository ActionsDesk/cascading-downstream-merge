# Actions Configuration

## Enable GitHub Actions to generate Pull Requests

In the admin permissions for the organization or repository enable the option to [Allow GitHub Actions to create and approve pull requests](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository#preventing-github-actions-from-creating-or-approving-pull-requests).
This is needed in order to allow the GitHub action to create and open the PRs.

## Disable the automatic deletion of branches after pull requests are merged

The action relies on the branch that opens the PR to remain in place so that the subsequent merges can still occur. The option for [Automatically delete head branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-the-automatic-deletion-of-branches) must be deselected in order for the action to work properly.

## Leveraging an Additional Merge Token to enable commits to protected branches

There are cases where you may want to use a branch protection rule for branch that needs to use the Cascade Merge. In those cases you'll need to use an additional variable named `MERGE_TOKEN` that has elevated access to the repository. The pre-existing `GITHUB_TOKEN` doesn't have enough permissions to bypass the restriction.

Therefore you'll need to create a [Machine User](https://docs.github.com/en/developers/overview/managing-deploy-keys#machine-users) with Admin access or a [custom GitHub App](https://docs.github.com/en/developers/apps/building-github-apps/creating-a-github-app) that only needs read/write for the contents permissions.
Than either of these can be used in the selected option to [Allow specified actors to bypass required pull requests](https://github.blog/changelog/2021-11-19-allow-bypassing-required-pull-requests/).

An example workflow that's using a custom GitHub app is as follows:
`.github/workflows/branch-automerge.yml`

```yml
---

name: Automatic Branch Merging

on:
  pull_request:
    types: [closed]

permissions:
  contents: write
  pull-requests: write
  issues: write

jobs:
  Merge:

    if: github.event.pull_request.merged == true && !startsWith( github.actor, '<<<CUSTOM-GITHUB-APP-NAME>>>' )

    runs-on: ubuntu-latest

    steps:

      - name: Generate Dynamic Credentials
        id: github-cascade-merge
        uses: getsentry/action-github-app-token@v1
        with:
          app_id: ${{ secrets.CUSTOM_GITHUB_MERGE_APP_ID }}
          private_key: ${{ secrets.CUSTOM_GITHUB_MERGE_KEY }}

      - name: Execute Automatic Merge
        uses: ActionsDesk/cascading-downstream-merge@v0.1.4
        with:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          MERGE_TOKEN: ${{ steps.github-cascade-merge.outputs.token }}
          prefixes: release/
          refBranch: develop
```

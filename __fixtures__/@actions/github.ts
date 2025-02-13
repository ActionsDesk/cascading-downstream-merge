import * as octokit from '../@octokit/rest.js'

export const getOctokit = () => octokit

export const context = {
  actor: 'mona',
  repo: {
    owner: 'ActionsDesk',
    repo: 'cascading-downstream-merge'
  },
  payload: {
    action: 'workflow_dispatch',
    organization: {
      login: 'ActionsDesk'
    },
    repository: {
      full_name: 'ActionsDesk/cascading-downstream-merge',
      name: 'cascading-downstream-merge',
      owner: {
        login: 'ActionsDesk'
      },
      url: 'https://api.github.com/repos/ActionsDesk/cascading-downstream-merge'
    },
    pull_request: {
      merged: true,
      number: 1,
      head: {
        ref: 'head-ref'
      },
      base: {
        ref: 'base-ref'
      }
    }
  },
  eventName: 'workflow_dispatch'
}

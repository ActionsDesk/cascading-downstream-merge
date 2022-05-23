# Extending the Probot Auto-Merge App with a Cascading Release Merge Feature

This document provides information on the Cascading Auto-Merge extension to the open source Probot auto-merge app, merging
release branches based on their semantic versioning, similar to [Bitbuckets 'Automatic branch merging'](https://confluence.atlassian.com/bitbucketserver/automatic-branch-merging-776639993.html).

---
## TOC
- [Description](#Description)
  - [Comparison-Matrix](#Comparison-Matrix)
- [Use-case](#Use-case)
- [Supported-Branch-Versioning](#Supported-Branch-Versioning)
  - [Version-Syntax](#Version-Syntax)
- [Auto-Merge-Rules](#Auto-Merge-Rules)
- [Merge-Scenarios](#Merge-Scenarios)

---

## Description

The **Cascading Auto Merge** feature is applicable per repository, it can be enabled on branch prefixes and supports semantic versioning.

The open source [probot-auto-merge](https://github.com/bobvanderlinden/probot-auto-merge) solution
has the core Auto Merge capability with fine grained control on the enablement / trigger options, but it
does not currently support the cascading auto-merge, the way [BitBucket Auto Merge](https://confluence.atlassian.com/bitbucketserver/automatic-branch-merging-776639993.html)
provides it. That is where this `cascading auto-merge` extension comes in.

Below is a list that highlights some of the features for each implementation.

### Comparison-Matrix

| # | Features | BitBucket | Probot-Auto-Merge | Notes |
|---|---|---|---|---|
|1|Automatic merging is off by default| :white_check_mark: | :white_check_mark: | |
|2|Commit messages will indicate a merge was automatic| :white_check_mark: | :white_check_mark: | |
|3|There are audit log entries for automatic merges| :white_check_mark: | :white_check_mark: | Each Merge is based on a PR|
|4|Notifications are sent when merges succeed or fail| :white_check_mark: | :white_check_mark: | Utilizing standard GitHub behavior|
|5|Cascading Branch merging| :white_check_mark: | :white_check_mark: | |
|6|Only branches matching the name of the pull request target are added into the merge path| :white_check_mark: | :white_check_mark: | branch name prefix |
|7|Custom activation of AutoMerge per Branch | | :white_check_mark: | GitHub Labels |
|8|Fine grained 'Approver' rules| | :white_check_mark: | |

[top](#TOC) :arrow_up:
## Use-case

To explain the **Cascading Auto Merge** functionality a little bit more detailed, I'll give some example.

- Lets say an organization has the following release branch structure in their Repository.

    |Branches|
    |---|
    |master|
    |development|
    |release/0.1|
    |release/1.1-rc.1|
    |**release/1.1**|
    |release/1.2|
    |release/2.0|
    |release/2.0.1-alpha|
    |release/2.0.1-beta|
    |release/2.0.1-beta.1|
    
---
    
- Now a developer makes a change to the *release/1.1* branch and issues a PR against the *development* branch, requesting at least one approval.

- With the **Cascading Auto Merge** functionality support the following should happen.

    Up on PR approval, the *release/1.1* branch gets ***auto-merged*** into the *development* branch and in addition the *release/1.1* branch gets **forward auto-merged** in to subsequent releases based on their semantic version order.

    This sample output should demonstrate the expected GitHub behaviour
    ![Screen Shot 2020-01-27 at 6 35 40 PM](https://user-images.githubusercontent.com/863198/73391036-3be32380-42a5-11ea-8e43-f45d3ac596ec.png)
    
---

 - In the original GitHub PR you will see comments for each subsequent cascading merge PR, including links to these PRs, providing a full audit trail of automated merges.
 
    Below is a sample output of a test run. 

    ![Screen Shot 2020-02-06 at 12 10 10 AM](https://user-images.githubusercontent.com/863198/74079847-f3e1a080-4a0a-11ea-817d-8d27be36dcb7.png)

[top](#TOC) :arrow_up:

---

## Supported-Branch-Versioning

The following will give some examples on the supported semantic versions

Reference: [Semantic Versioning](https://semver.org/)

### A semantic version number - MAJOR.MINOR.PATCH

- **MAJOR** version when you make incompatible API changes
- **MINOR** version when you add functionality in a backwards compatible manner
- **PATCH** version when you make backwards compatible bug fixes

### Additional labels for pre-release and build metadata

These are available as extensions to the MAJOR.MINOR.PATCH format.

| Extensions | + Version |
|---|---|
|alpha | alpha.1 |
|beta |beta.1 |
|rc |rc.1 |

### Version-Syntax

### \<Branch-Prefix>/\<MAJOR>.\<MINOR>.\<PATCH>-[ alpha | beta | rc ].\<version>

> The *Branch-Prefix* is specific to our implementation 

---

### Some examples for versions and their priority

In these examples we omit the *Branch-Prefix*

#### Standard versioning

|Example|
|---|
| 1.1.0 < 1.1.2 < 1.2.0 < 1.2.1 < 1.3.0 < 2.0.0 |

#### Pre-release fields

|Example|
|---|
|1.0.0-alpha < 1.0.0-alpha.1 < 1.0.0-beta < 1.0.0-beta.2 < 1.0.0-beta.11 < 1.0.0-rc.1 < 1.0.0|

---

## Branch Naming Examples

- release/1.1.0
- release/1.2.0-beta
- feature/1.1.0-alpha.1

[top](#TOC) :arrow_up:

---

## Auto-Merge-Rules

The following is a little bit like a Rules engine, we have our **facts** (create, merge), that in combination define certain 
**conditions** and the determined outcome of these conditions form a **rule**. 
The table describes the core **rules**.

With this definition we can predict the outcome of sample [Merge-Scenarios](#Merge-Scenarios).

#### Legend:

:white_check_mark: success

:x: failed

| # |Original PR       |                  |Cascading PR      |                  |Condition                  |Actions             |                    |                                         |
|---|---               |---               |---               |---               |---                        |---                 |---                 |---                                      |
|   |create            |merge             |create            |merge             |                           |Issue               |Cascading-Auto-Merge|Notes                                    |
|1  |:white_check_mark:|:white_check_mark:|:white_check_mark:|:white_check_mark:|NA                         |none                |continue            |All good nothing to report               |
|2  |:white_check_mark:|:white_check_mark:|:white_check_mark:|:x:               |NA                         |:white_check_mark:  |stop                |                                         |
|3  |:white_check_mark:|:white_check_mark:|:x:               |NA                |A PR already exists        |:white_check_mark:  |stop                |a PR already exists cannot create new one|
|4  |:white_check_mark:|:white_check_mark:|:x:               |NA                |No commits between releases|none                |continue            |commits might have already been merged   |
|5  |:white_check_mark:|:x:               |NA                |NA                |Original PR merge conflict |none                |NA                  |Original PR contains all info            |
|6  |:x:               |NA                |NA                |NA                |Nothing even happened      |none                |NA                  |Auto-Merge not triggered                 |

---

## Merge-Scenarios

A couple of merge scenarios and the resulting behavior of the **cascading auto-merge feature**. 

#### Sample semantic release versions:  
- master
- development        
- release/0.1 < release/1.1-rc.1 < release/1.1 < release/1.2 < release/2.0 < release/2.0.1-alpha < release/2.0.1-beta < release/2.0.1-beta.1

> Note: omitting the prefix, 'release'

#### Legend:

:white_check_mark: successful merge

:x: merge conflict

| # | scenario           | description           | Parent PR merged status  | cascading PR merge status | Notification location    | Notes                                                                     |
|---|--------------------|-----------------------|--------------------------|---------------------------|--------------------------|---------------------------------------------------------------------------|
| 1 | 1.1 -> development | standard Git workflow | :white_check_mark:       | :white_check_mark:        | In Original PR (msg: created cascading PR # ) | all good, no additional action required                                   |
| 2 | 1.1 -> development | standard Git workflow | :white_check_mark:       | :x:                       | In Original PR (msg: created cascading PR #), create failed merge issue | cascading merge halts, completed merges remain |
| 3 | 1.1 -> development | standard Git workflow | :x:                      | :x:                       | In Original PR, (msg: merge conflict)         | no cascading merge triggered                                              |
| 4 | 1.1 -> 1.2         | release to release    | :white_check_mark:       | :white_check_mark:        | In Original PR (msg: no commit for PR)        | merge base (1.2) is in cascading merge, App will try to execute twice, safe  |
| 5 | 1.1 -> 1.2         | release to release    | :white_check_mark:       | :x:                       | In Original PR (msg: created cascading PR #), create failed merge issue | cascading merge halts, completed merges remain |
| 6 | 1.1 -> 1.2         | release to release    | :x:                      | :x:                       | In Original PR (msg: merge conflict)          | no cascading merge triggered                                              |
| 7 | patch -> 1.1       | standard Git workflow | :white_check_mark:       | :x:                       | In Original PR, no comment about cascading PR | auto-merge triggers on 'head-branch' name only, if you require cascading merges, combine with scenario #4 |
| 8 | 2.0.1-beta.1 -> development | standard Git workflow | :white_check_mark: | :x:                    | In Original PR, no comment about cascading PR | is latest release, no subsequent releases                                    |
| 9 | 1.2 -> 1.1         | back porting a change | :white_check_mark:       | :white_check_mark:        | In Original PR (msg: created cascading PR #)  | cascading merge triggered, subsequent release will be merged, no different from merging to 'development' |                                  |

[top](#TOC) :arrow_up:

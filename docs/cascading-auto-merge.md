# Cascading Auto Merge Action

This document provides information on the Cascading Auto-Merge Action.

This Action auto-merges release branches based on their semantic versioning, similar to [Bitbuckets 'Automatic branch merging'](https://confluence.atlassian.com/bitbucketserver/automatic-branch-merging-776639993.html).

---

## Description

The **Cascading Auto Merge** feature is applicable per repository, it can be enabled on branch prefixes and supports semantic versioning.

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

---

## Supported-Branch-Versioning

The following will give some examples on the supported semantic versions

Reference: [Semantic Versioning](https://semver.org/)

### A semantic version number - MAJOR.MINOR.PATCH

- **MAJOR** version when you make incompatible API changes
- **MINOR** version when you add functionality in a backward compatible manner
- **PATCH** version when you make backward compatible bugfixes

### Additional labels for prerelease and build metadata

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

#### Prerelease fields

|Example|
|---|
|1.0.0-alpha < 1.0.0-alpha.1 < 1.0.0-beta < 1.0.0-beta.2 < 1.0.0-beta.11 < 1.0.0-rc.1 < 1.0.0|

---

## Branch Naming Examples

- release/1.1.0
- release/1.2.0-beta
- feature/1.1.0-alpha.1

---

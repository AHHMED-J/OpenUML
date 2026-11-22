# Code signing policy

> **Status:** OpenUML has applied to SignPath Foundation for free code signing. Until the application is
> approved, the Windows installers are not signed.

Free code signing provided by [SignPath.io](https://about.signpath.io), certificate by
[SignPath Foundation](https://signpath.org).

## What is signed

The Windows installer (`OpenUML-<version>-win-x64.exe`) and the program files inside it, for every release
published on the [Releases page](https://github.com/AHHMED-J/OpenUML/releases). They are built by the
[Release workflow](../.github/workflows/release.yml) on GitHub Actions from the tagged source code in this
repository; nothing is built or signed on a personal computer.

## Team roles

| Role | Members |
| --- | --- |
| Committers and reviewers | [AHHMED-J](https://github.com/AHHMED-J) |
| Approvers | [AHHMED-J](https://github.com/AHHMED-J) |

Changes proposed by anyone else (pull requests) are reviewed by a committer before they are merged. Every
signing request is approved by hand by an approver. All members use multi-factor authentication on GitHub
and SignPath.

## Privacy policy

OpenUML does not collect personal data and does not send your models anywhere: files are read and written
only on your computer, where you choose.

The only connection OpenUML makes on its own is the update check: at startup and once a day it asks the
GitHub API (`api.github.com`) for the latest release. The request carries the OpenUML version and nothing
else; GitHub handles it under the [GitHub Privacy Statement](https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement).
Turn it off in *Preferences > Updates*. Links such as *Download* or *Full changelog* open in your browser
only when you click them.

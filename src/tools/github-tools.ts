import { z } from 'zod';
import { GitHubClient } from '../providers/github/client.js';
import { mcpLogger as logger } from '../utils/logger.js';

const githubClient = new GitHubClient();

// Helper function to format result as MCP content with structured output
function formatResult(data: Record<string, unknown>) {
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify(data, null, 2)
    }],
    structuredContent: data
  };
}

// Input schemas
const ListReposInputSchema = z.object({
  username: z.string().optional().describe('GitHub username to list repos for (default: authenticated user)'),
  page: z.number().min(1).optional().default(1).describe('Page number'),
  perPage: z.number().min(1).max(100).optional().default(30).describe('Number of repos per page')
});

const GetRepoInputSchema = z.object({
  owner: z.string().describe('Repository owner (username or organization)'),
  repo: z.string().describe('Repository name')
});

const ListIssuesInputSchema = z.object({
  owner: z.string().describe('Repository owner'),
  repo: z.string().describe('Repository name'),
  state: z.enum(['open', 'closed', 'all']).optional().default('open').describe('Issue state filter'),
  page: z.number().min(1).optional().default(1).describe('Page number'),
  perPage: z.number().min(1).max(100).optional().default(30).describe('Issues per page')
});

const CreateIssueInputSchema = z.object({
  owner: z.string().describe('Repository owner'),
  repo: z.string().describe('Repository name'),
  title: z.string().describe('Issue title'),
  body: z.string().optional().describe('Issue body/description'),
  labels: z.array(z.string()).optional().describe('Labels to assign'),
  assignees: z.array(z.string()).optional().describe('Usernames to assign')
});

const CreatePullRequestInputSchema = z.object({
  owner: z.string().describe('Repository owner'),
  repo: z.string().describe('Repository name'),
  title: z.string().describe('Pull request title'),
  head: z.string().describe('The name of the branch where your changes are implemented'),
  base: z.string().describe('The name of the branch you want the changes pulled into'),
  body: z.string().optional().describe('Pull request body/description'),
  draft: z.boolean().optional().default(false).describe('Whether to create as draft')
});

// Output schemas
const RepositoryOutputSchema = z.object({
  id: z.number(),
  name: z.string(),
  fullName: z.string(),
  description: z.string().nullable(),
  url: z.string(),
  stars: z.number(),
  forks: z.number(),
  openIssues: z.number(),
  language: z.string().nullable(),
  isPrivate: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string()
});

const RepositoryListOutputSchema = z.object({
  repositories: z.array(RepositoryOutputSchema)
});

const IssueOutputSchema = z.object({
  id: z.number(),
  number: z.number(),
  title: z.string(),
  state: z.string(),
  body: z.string().nullable(),
  user: z.string(),
  labels: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
  closedAt: z.string().nullable(),
  comments: z.number()
});

const IssueListOutputSchema = z.object({
  issues: z.array(IssueOutputSchema)
});

const PullRequestOutputSchema = z.object({
  id: z.number(),
  number: z.number(),
  title: z.string(),
  state: z.string(),
  body: z.string().nullable(),
  user: z.string(),
  head: z.string(),
  base: z.string(),
  draft: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  mergedAt: z.string().nullable(),
  htmlUrl: z.string()
});

const PullRequestListOutputSchema = z.object({
  pullRequests: z.array(PullRequestOutputSchema)
});

// New Input Schemas for comprehensive GitHub operations
const CreateRepoInputSchema = z.object({
  name: z.string().describe('Repository name'),
  description: z.string().optional().describe('Repository description'),
  isPrivate: z.boolean().optional().default(false).describe('Whether the repo should be private'),
  autoInit: z.boolean().optional().default(false).describe('Initialize with README'),
  gitignoreTemplate: z.string().optional().describe('Gitignore template name (e.g., Node, Python, Go)'),
  licenseTemplate: z.string().optional().describe('License template (e.g., mit, apache-2.0)'),
  hasIssues: z.boolean().optional().default(true).describe('Enable issues'),
  hasProjects: z.boolean().optional().default(true).describe('Enable projects'),
  hasWiki: z.boolean().optional().default(true).describe('Enable wiki'),
  allowSquashMerge: z.boolean().optional().default(true).describe('Allow squash merging'),
  allowMergeCommit: z.boolean().optional().default(true).describe('Allow merge commits'),
  allowRebaseMerge: z.boolean().optional().default(true).describe('Allow rebase merging'),
  deleteBranchOnMerge: z.boolean().optional().default(false).describe('Delete head branches on merge')
});

const UpdateRepoInputSchema = z.object({
  owner: z.string().describe('Repository owner'),
  repo: z.string().describe('Repository name'),
  name: z.string().optional().describe('New repository name'),
  description: z.string().optional().describe('New description'),
  isPrivate: z.boolean().optional().describe('Change privacy setting'),
  hasIssues: z.boolean().optional().describe('Enable/disable issues'),
  hasProjects: z.boolean().optional().describe('Enable/disable projects'),
  hasWiki: z.boolean().optional().describe('Enable/disable wiki'),
  defaultBranch: z.string().optional().describe('Change default branch'),
  archived: z.boolean().optional().describe('Archive/unarchive repository')
});

const DeleteRepoInputSchema = z.object({
  owner: z.string().describe('Repository owner'),
  repo: z.string().describe('Repository name')
});

const ForkRepoInputSchema = z.object({
  owner: z.string().describe('Repository owner to fork from'),
  repo: z.string().describe('Repository name to fork'),
  organization: z.string().optional().describe('Organization to fork into (optional)'),
  name: z.string().optional().describe('New name for the fork (optional)'),
  defaultBranchOnly: z.boolean().optional().default(false).describe('Fork only default branch')
});

// Branch operations
const ListBranchesInputSchema = z.object({
  owner: z.string().describe('Repository owner'),
  repo: z.string().describe('Repository name'),
  page: z.number().min(1).optional().default(1).describe('Page number'),
  perPage: z.number().min(1).max(100).optional().default(30).describe('Items per page')
});

const GetBranchInputSchema = z.object({
  owner: z.string().describe('Repository owner'),
  repo: z.string().describe('Repository name'),
  branch: z.string().describe('Branch name')
});

const CreateBranchInputSchema = z.object({
  owner: z.string().describe('Repository owner'),
  repo: z.string().describe('Repository name'),
  branchName: z.string().describe('New branch name'),
  fromBranch: z.string().default('main').describe('Source branch to create from')
});

const BranchOutputSchema = z.object({
  name: z.string(),
  sha: z.string(),
  protected: z.boolean(),
  protectionUrl: z.string().optional()
});

const BranchListOutputSchema = z.object({
  branches: z.array(BranchOutputSchema)
});

// Commit operations
const ListCommitsInputSchema = z.object({
  owner: z.string().describe('Repository owner'),
  repo: z.string().describe('Repository name'),
  branch: z.string().optional().describe('Branch name (default: default branch)'),
  page: z.number().min(1).optional().default(1).describe('Page number'),
  perPage: z.number().min(1).max(100).optional().default(30).describe('Items per page')
});

const GetCommitInputSchema = z.object({
  owner: z.string().describe('Repository owner'),
  repo: z.string().describe('Repository name'),
  sha: z.string().describe('Commit SHA')
});

const CommitOutputSchema = z.object({
  sha: z.string(),
  message: z.string(),
  author: z.object({
    name: z.string(),
    email: z.string(),
    date: z.string()
  }),
  committer: z.object({
    name: z.string(),
    email: z.string(),
    date: z.string()
  }),
  htmlUrl: z.string(),
  parents: z.array(z.object({
    sha: z.string(),
    url: z.string()
  }))
});

const CommitListOutputSchema = z.object({
  commits: z.array(CommitOutputSchema)
});

// File operations
const GetContentInputSchema = z.object({
  owner: z.string().describe('Repository owner'),
  repo: z.string().describe('Repository name'),
  path: z.string().optional().default('').describe('File or directory path'),
  ref: z.string().optional().describe('Branch, tag, or commit SHA')
});

const CreateOrUpdateFileInputSchema = z.object({
  owner: z.string().describe('Repository owner'),
  repo: z.string().describe('Repository name'),
  path: z.string().describe('File path'),
  message: z.string().describe('Commit message'),
  content: z.string().describe('File content (will be base64 encoded)'),
  sha: z.string().optional().describe('Current blob SHA (required for updates)'),
  branch: z.string().optional().describe('Target branch')
});

const DeleteFileInputSchema = z.object({
  owner: z.string().describe('Repository owner'),
  repo: z.string().describe('Repository name'),
  path: z.string().describe('File path'),
  message: z.string().describe('Commit message'),
  sha: z.string().describe('Current blob SHA of the file'),
  branch: z.string().optional().describe('Target branch')
});

const ContentOutputSchema = z.object({
  type: z.string(),
  name: z.string(),
  path: z.string(),
  sha: z.string(),
  size: z.number(),
  htmlUrl: z.string(),
  downloadUrl: z.string().nullable(),
  content: z.string().optional()
});

const ContentListOutputSchema = z.object({
  contents: z.array(ContentOutputSchema)
});

const FileCommitOutputSchema = z.object({
  commitSha: z.string(),
  commitUrl: z.string(),
  content: ContentOutputSchema
});

// Pull Request operations
const ListPullRequestsInputSchema = z.object({
  owner: z.string().describe('Repository owner'),
  repo: z.string().describe('Repository name'),
  state: z.enum(['open', 'closed', 'all']).optional().default('open').describe('PR state filter'),
  head: z.string().optional().describe('Filter by head branch'),
  base: z.string().optional().describe('Filter by base branch'),
  sort: z.enum(['created', 'updated', 'popularity', 'long-running']).optional().default('created').describe('Sort by'),
  direction: z.enum(['asc', 'desc']).optional().default('desc').describe('Sort direction'),
  page: z.number().min(1).optional().default(1).describe('Page number'),
  perPage: z.number().min(1).max(100).optional().default(30).describe('Items per page')
});

const GetPullRequestInputSchema = z.object({
  owner: z.string().describe('Repository owner'),
  repo: z.string().describe('Repository name'),
  pullNumber: z.number().describe('Pull request number')
});

const MergePullRequestInputSchema = z.object({
  owner: z.string().describe('Repository owner'),
  repo: z.string().describe('Repository name'),
  pullNumber: z.number().describe('Pull request number'),
  commitTitle: z.string().optional().describe('Custom merge commit title'),
  commitMessage: z.string().optional().describe('Custom merge commit message'),
  sha: z.string().optional().describe('Expected head SHA (for verification)'),
  mergeMethod: z.enum(['merge', 'squash', 'rebase']).optional().default('merge').describe('Merge method')
});

const MergePullRequestOutputSchema = z.object({
  sha: z.string(),
  merged: z.boolean(),
  message: z.string()
});

// Collaborator operations
const ListCollaboratorsInputSchema = z.object({
  owner: z.string().describe('Repository owner'),
  repo: z.string().describe('Repository name'),
  page: z.number().min(1).optional().default(1).describe('Page number'),
  perPage: z.number().min(1).max(100).optional().default(30).describe('Items per page')
});

const AddCollaboratorInputSchema = z.object({
  owner: z.string().describe('Repository owner'),
  repo: z.string().describe('Repository name'),
  username: z.string().describe('Username to add'),
  permission: z.enum(['pull', 'push', 'admin', 'maintain', 'triage']).optional().default('push').describe('Permission level')
});

const RemoveCollaboratorInputSchema = z.object({
  owner: z.string().describe('Repository owner'),
  repo: z.string().describe('Repository name'),
  username: z.string().describe('Username to remove')
});

const CollaboratorOutputSchema = z.object({
  login: z.string(),
  id: z.number(),
  avatarUrl: z.string(),
  htmlUrl: z.string(),
  permissions: z.object({
    admin: z.boolean(),
    push: z.boolean(),
    pull: z.boolean()
  }).optional()
});

const CollaboratorListOutputSchema = z.object({
  collaborators: z.array(CollaboratorOutputSchema)
});

// Release operations
const ListReleasesInputSchema = z.object({
  owner: z.string().describe('Repository owner'),
  repo: z.string().describe('Repository name'),
  page: z.number().min(1).optional().default(1).describe('Page number'),
  perPage: z.number().min(1).max(100).optional().default(30).describe('Items per page')
});

const CreateReleaseInputSchema = z.object({
  owner: z.string().describe('Repository owner'),
  repo: z.string().describe('Repository name'),
  tagName: z.string().describe('Git tag for the release'),
  targetCommitish: z.string().optional().describe('Commitish value to tag'),
  name: z.string().optional().describe('Release name'),
  body: z.string().optional().describe('Release description'),
  draft: z.boolean().optional().default(false).describe('Create as draft'),
  prerelease: z.boolean().optional().default(false).describe('Mark as prerelease'),
  generateReleaseNotes: z.boolean().optional().default(false).describe('Auto-generate release notes')
});

const ReleaseOutputSchema = z.object({
  id: z.number(),
  tagName: z.string(),
  targetCommitish: z.string(),
  name: z.string().nullable(),
  body: z.string().nullable(),
  draft: z.boolean(),
  prerelease: z.boolean(),
  createdAt: z.string(),
  publishedAt: z.string().nullable(),
  author: z.string(),
  htmlUrl: z.string(),
  tarballUrl: z.string(),
  zipballUrl: z.string()
});

const ReleaseListOutputSchema = z.object({
  releases: z.array(ReleaseOutputSchema)
});

// Tool definitions
export const githubTools = {
  github_list_repos: {
    description: 'List GitHub repositories for a user or the authenticated user',
    inputSchema: ListReposInputSchema,
    outputSchema: RepositoryListOutputSchema,
    handler: async (input: z.infer<typeof ListReposInputSchema>) => {
      try {
        logger.info('Listing GitHub repos', { username: input.username });
        const repos = await githubClient.listRepositories(input.username, input.page, input.perPage);
        
        const result = {
          repositories: repos.map(repo => ({
            id: repo.id,
            name: repo.name,
            fullName: repo.full_name,
            description: repo.description,
            url: repo.html_url,
            stars: repo.stargazers_count,
            forks: repo.forks_count,
            openIssues: repo.open_issues_count,
            language: repo.language,
            isPrivate: repo.private,
            createdAt: repo.created_at,
            updatedAt: repo.updated_at
          }))
        };
        
        return formatResult(result);
      } catch (error) {
        logger.error('Error in github_list_repos:', error);
        throw error;
      }
    }
  },

  github_get_repo: {
    description: 'Get detailed information about a specific GitHub repository',
    inputSchema: GetRepoInputSchema,
    outputSchema: RepositoryOutputSchema,
    handler: async (input: z.infer<typeof GetRepoInputSchema>) => {
      try {
        logger.info('Getting GitHub repo', { owner: input.owner, repo: input.repo });
        const repo = await githubClient.getRepository(input.owner, input.repo);
        
        const result = {
          id: repo.id,
          name: repo.name,
          fullName: repo.full_name,
          description: repo.description,
          url: repo.html_url,
          stars: repo.stargazers_count,
          forks: repo.forks_count,
          openIssues: repo.open_issues_count,
          language: repo.language,
          isPrivate: repo.private,
          createdAt: repo.created_at,
          updatedAt: repo.updated_at
        };
        
        return formatResult(result);
      } catch (error) {
        logger.error('Error in github_get_repo:', error);
        throw error;
      }
    }
  },

  github_list_issues: {
    description: 'List issues in a GitHub repository',
    inputSchema: ListIssuesInputSchema,
    outputSchema: IssueListOutputSchema,
    handler: async (input: z.infer<typeof ListIssuesInputSchema>) => {
      try {
        logger.info('Listing GitHub issues', { owner: input.owner, repo: input.repo });
        const issues = await githubClient.listIssues(input.owner, input.repo, input.state, input.page, input.perPage);
        
        const result = {
          issues: issues.map(issue => ({
            id: issue.id,
            number: issue.number,
            title: issue.title,
            state: issue.state,
            body: issue.body,
            user: issue.user.login,
            labels: issue.labels.map(l => l.name),
            createdAt: issue.created_at,
            updatedAt: issue.updated_at,
            closedAt: issue.closed_at,
            comments: issue.comments
          }))
        };
        
        return formatResult(result);
      } catch (error) {
        logger.error('Error in github_list_issues:', error);
        throw error;
      }
    }
  },

  github_create_issue: {
    description: 'Create a new issue in a GitHub repository',
    inputSchema: CreateIssueInputSchema,
    outputSchema: IssueOutputSchema,
    handler: async (input: z.infer<typeof CreateIssueInputSchema>) => {
      try {
        logger.info('Creating GitHub issue', { owner: input.owner, repo: input.repo, title: input.title });
        const issue = await githubClient.createIssue(input.owner, input.repo, {
          title: input.title,
          body: input.body,
          labels: input.labels,
          assignees: input.assignees
        });
        
        const result = {
          id: issue.id,
          number: issue.number,
          title: issue.title,
          state: issue.state,
          body: issue.body,
          user: issue.user.login,
          labels: issue.labels.map(l => l.name),
          createdAt: issue.created_at,
          updatedAt: issue.updated_at,
          closedAt: issue.closed_at,
          comments: issue.comments
        };
        
        return formatResult(result);
      } catch (error) {
        logger.error('Error in github_create_issue:', error);
        throw error;
      }
    }
  },

  github_create_pull_request: {
    description: 'Create a new pull request in a GitHub repository',
    inputSchema: CreatePullRequestInputSchema,
    outputSchema: PullRequestOutputSchema,
    handler: async (input: z.infer<typeof CreatePullRequestInputSchema>) => {
      try {
        logger.info('Creating GitHub PR', { owner: input.owner, repo: input.repo, title: input.title });
        const pr = await githubClient.createPullRequest(input.owner, input.repo, {
          title: input.title,
          head: input.head,
          base: input.base,
          body: input.body,
          draft: input.draft
        });
        
        const result = {
          id: pr.id,
          number: pr.number,
          title: pr.title,
          state: pr.state,
          body: pr.body,
          user: pr.user.login,
          head: pr.head.label,
          base: pr.base.label,
          draft: pr.draft,
          createdAt: pr.created_at,
          updatedAt: pr.updated_at,
          mergedAt: pr.merged_at,
          htmlUrl: pr.html_url
        };
        
        return formatResult(result);
      } catch (error) {
        logger.error('Error in github_create_pull_request:', error);
        throw error;
      }
    }
  },

  // Repository Management Tools
  github_create_repo: {
    description: 'Create a new GitHub repository',
    inputSchema: CreateRepoInputSchema,
    outputSchema: RepositoryOutputSchema,
    handler: async (input: z.infer<typeof CreateRepoInputSchema>) => {
      try {
        logger.info('Creating GitHub repository', { name: input.name });
        const repo = await githubClient.createRepository({
          name: input.name,
          description: input.description,
          private: input.isPrivate,
          auto_init: input.autoInit,
          gitignore_template: input.gitignoreTemplate,
          license_template: input.licenseTemplate,
          has_issues: input.hasIssues,
          has_projects: input.hasProjects,
          has_wiki: input.hasWiki,
          allow_squash_merge: input.allowSquashMerge,
          allow_merge_commit: input.allowMergeCommit,
          allow_rebase_merge: input.allowRebaseMerge,
          delete_branch_on_merge: input.deleteBranchOnMerge
        });
        
        return formatResult({
          id: repo.id,
          name: repo.name,
          fullName: repo.full_name,
          description: repo.description,
          url: repo.html_url,
          stars: repo.stargazers_count,
          forks: repo.forks_count,
          openIssues: repo.open_issues_count,
          language: repo.language,
          isPrivate: repo.private,
          createdAt: repo.created_at,
          updatedAt: repo.updated_at
        });
      } catch (error) {
        logger.error('Error in github_create_repo:', error);
        throw error;
      }
    }
  },

  github_update_repo: {
    description: 'Update an existing GitHub repository',
    inputSchema: UpdateRepoInputSchema,
    outputSchema: RepositoryOutputSchema,
    handler: async (input: z.infer<typeof UpdateRepoInputSchema>) => {
      try {
        logger.info('Updating GitHub repository', { owner: input.owner, repo: input.repo });
        const repo = await githubClient.updateRepository(input.owner, input.repo, {
          name: input.name,
          description: input.description,
          private: input.isPrivate,
          has_issues: input.hasIssues,
          has_projects: input.hasProjects,
          has_wiki: input.hasWiki,
          default_branch: input.defaultBranch,
          archived: input.archived
        });
        
        return formatResult({
          id: repo.id,
          name: repo.name,
          fullName: repo.full_name,
          description: repo.description,
          url: repo.html_url,
          stars: repo.stargazers_count,
          forks: repo.forks_count,
          openIssues: repo.open_issues_count,
          language: repo.language,
          isPrivate: repo.private,
          createdAt: repo.created_at,
          updatedAt: repo.updated_at
        });
      } catch (error) {
        logger.error('Error in github_update_repo:', error);
        throw error;
      }
    }
  },

  github_delete_repo: {
    description: 'Delete a GitHub repository (requires admin access)',
    inputSchema: DeleteRepoInputSchema,
    outputSchema: z.object({ success: z.boolean(), message: z.string() }),
    handler: async (input: z.infer<typeof DeleteRepoInputSchema>) => {
      try {
        logger.info('Deleting GitHub repository', { owner: input.owner, repo: input.repo });
        await githubClient.deleteRepository(input.owner, input.repo);
        
        return formatResult({
          success: true,
          message: `Repository ${input.owner}/${input.repo} has been deleted successfully`
        });
      } catch (error) {
        logger.error('Error in github_delete_repo:', error);
        throw error;
      }
    }
  },

  github_fork_repo: {
    description: 'Fork a GitHub repository',
    inputSchema: ForkRepoInputSchema,
    outputSchema: RepositoryOutputSchema,
    handler: async (input: z.infer<typeof ForkRepoInputSchema>) => {
      try {
        logger.info('Forking GitHub repository', { owner: input.owner, repo: input.repo });
        const repo = await githubClient.forkRepository(input.owner, input.repo, {
          organization: input.organization,
          name: input.name,
          default_branch_only: input.defaultBranchOnly
        });
        
        return formatResult({
          id: repo.id,
          name: repo.name,
          fullName: repo.full_name,
          description: repo.description,
          url: repo.html_url,
          stars: repo.stargazers_count,
          forks: repo.forks_count,
          openIssues: repo.open_issues_count,
          language: repo.language,
          isPrivate: repo.private,
          createdAt: repo.created_at,
          updatedAt: repo.updated_at
        });
      } catch (error) {
        logger.error('Error in github_fork_repo:', error);
        throw error;
      }
    }
  },

  // Branch Operations
  github_list_branches: {
    description: 'List branches in a GitHub repository',
    inputSchema: ListBranchesInputSchema,
    outputSchema: BranchListOutputSchema,
    handler: async (input: z.infer<typeof ListBranchesInputSchema>) => {
      try {
        logger.info('Listing GitHub branches', { owner: input.owner, repo: input.repo });
        const branches = await githubClient.listBranches(input.owner, input.repo, input.page, input.perPage);
        
        return formatResult({
          branches: branches.map(branch => ({
            name: branch.name,
            sha: branch.commit.sha,
            protected: branch.protected,
            protectionUrl: branch.protection?.enabled ? branch.commit.url : undefined
          }))
        });
      } catch (error) {
        logger.error('Error in github_list_branches:', error);
        throw error;
      }
    }
  },

  github_get_branch: {
    description: 'Get details of a specific branch',
    inputSchema: GetBranchInputSchema,
    outputSchema: BranchOutputSchema,
    handler: async (input: z.infer<typeof GetBranchInputSchema>) => {
      try {
        logger.info('Getting GitHub branch', { owner: input.owner, repo: input.repo, branch: input.branch });
        const branch = await githubClient.getBranch(input.owner, input.repo, input.branch);
        
        return formatResult({
          name: branch.name,
          sha: branch.commit.sha,
          protected: branch.protected,
          protectionUrl: branch.protection?.enabled ? branch.commit.url : undefined
        });
      } catch (error) {
        logger.error('Error in github_get_branch:', error);
        throw error;
      }
    }
  },

  github_create_branch: {
    description: 'Create a new branch in a GitHub repository',
    inputSchema: CreateBranchInputSchema,
    outputSchema: z.object({ ref: z.string(), url: z.string(), sha: z.string() }),
    handler: async (input: z.infer<typeof CreateBranchInputSchema>) => {
      try {
        logger.info('Creating GitHub branch', { owner: input.owner, repo: input.repo, branch: input.branchName });
        
        // Get the source branch's latest commit SHA
        const sourceBranch = await githubClient.getBranch(input.owner, input.repo, input.fromBranch);
        
        const reference = await githubClient.createBranch(input.owner, input.repo, {
          ref: input.branchName,
          sha: sourceBranch.commit.sha
        });
        
        return formatResult({
          ref: reference.ref,
          url: reference.url,
          sha: reference.object.sha
        });
      } catch (error) {
        logger.error('Error in github_create_branch:', error);
        throw error;
      }
    }
  },

  // Commit Operations
  github_list_commits: {
    description: 'List commits in a GitHub repository',
    inputSchema: ListCommitsInputSchema,
    outputSchema: CommitListOutputSchema,
    handler: async (input: z.infer<typeof ListCommitsInputSchema>) => {
      try {
        logger.info('Listing GitHub commits', { owner: input.owner, repo: input.repo });
        const commits = await githubClient.listCommits(input.owner, input.repo, input.branch, input.page, input.perPage);
        
        return formatResult({
          commits: commits.map(commit => ({
            sha: commit.sha,
            message: commit.commit.message,
            author: {
              name: commit.commit.author.name,
              email: commit.commit.author.email,
              date: commit.commit.author.date || commit.commit.committer.date
            },
            committer: {
              name: commit.commit.committer.name,
              email: commit.commit.committer.email,
              date: commit.commit.committer.date
            },
            htmlUrl: commit.html_url,
            parents: commit.parents.map(p => ({ sha: p.sha, url: p.url }))
          }))
        });
      } catch (error) {
        logger.error('Error in github_list_commits:', error);
        throw error;
      }
    }
  },

  github_get_commit: {
    description: 'Get details of a specific commit',
    inputSchema: GetCommitInputSchema,
    outputSchema: CommitOutputSchema,
    handler: async (input: z.infer<typeof GetCommitInputSchema>) => {
      try {
        logger.info('Getting GitHub commit', { owner: input.owner, repo: input.repo, sha: input.sha });
        const commit = await githubClient.getCommit(input.owner, input.repo, input.sha);
        
        return formatResult({
          sha: commit.sha,
          message: commit.commit.message,
          author: {
            name: commit.commit.author.name,
            email: commit.commit.author.email,
            date: commit.commit.author.date || commit.commit.committer.date
          },
          committer: {
            name: commit.commit.committer.name,
            email: commit.commit.committer.email,
            date: commit.commit.committer.date
          },
          htmlUrl: commit.html_url,
          parents: commit.parents.map(p => ({ sha: p.sha, url: p.url }))
        });
      } catch (error) {
        logger.error('Error in github_get_commit:', error);
        throw error;
      }
    }
  },

  // File Operations
  github_get_content: {
    description: 'Get contents of a file or directory from a GitHub repository',
    inputSchema: GetContentInputSchema,
    outputSchema: z.union([ContentOutputSchema, ContentListOutputSchema]),
    handler: async (input: z.infer<typeof GetContentInputSchema>) => {
      try {
        logger.info('Getting GitHub content', { owner: input.owner, repo: input.repo, path: input.path });
        const content = await githubClient.getRepositoryContent(input.owner, input.repo, input.path, input.ref);
        
        if (Array.isArray(content)) {
          return formatResult({
            contents: content.map(item => ({
              type: item.type,
              name: item.name,
              path: item.path,
              sha: item.sha,
              size: item.size,
              htmlUrl: item.html_url,
              downloadUrl: item.download_url,
              content: item.content
            }))
          });
        } else {
          return formatResult({
            type: content.type,
            name: content.name,
            path: content.path,
            sha: content.sha,
            size: content.size,
            htmlUrl: content.html_url,
            downloadUrl: content.download_url,
            content: content.content
          });
        }
      } catch (error) {
        logger.error('Error in github_get_content:', error);
        throw error;
      }
    }
  },

  github_create_or_update_file: {
    description: 'Create or update a file in a GitHub repository',
    inputSchema: CreateOrUpdateFileInputSchema,
    outputSchema: FileCommitOutputSchema,
    handler: async (input: z.infer<typeof CreateOrUpdateFileInputSchema>) => {
      try {
        logger.info('Creating/updating file in GitHub', { owner: input.owner, repo: input.repo, path: input.path });
        
        // Base64 encode the content
        const base64Content = Buffer.from(input.content).toString('base64');
        
        const response = await githubClient.createOrUpdateFile(input.owner, input.repo, input.path, {
          message: input.message,
          content: base64Content,
          sha: input.sha,
          branch: input.branch
        });
        
        return formatResult({
          commitSha: response.commit.sha,
          commitUrl: response.commit.html_url,
          content: {
            type: response.content.type,
            name: response.content.name,
            path: response.content.path,
            sha: response.content.sha,
            size: response.content.size,
            htmlUrl: response.content.html_url,
            downloadUrl: response.content.download_url
          }
        });
      } catch (error) {
        logger.error('Error in github_create_or_update_file:', error);
        throw error;
      }
    }
  },

  github_delete_file: {
    description: 'Delete a file from a GitHub repository',
    inputSchema: DeleteFileInputSchema,
    outputSchema: z.object({ success: z.boolean(), commitSha: z.string(), commitUrl: z.string() }),
    handler: async (input: z.infer<typeof DeleteFileInputSchema>) => {
      try {
        logger.info('Deleting file from GitHub', { owner: input.owner, repo: input.repo, path: input.path });
        const response = await githubClient.deleteFile(input.owner, input.repo, input.path, {
          message: input.message,
          sha: input.sha,
          branch: input.branch
        });
        
        return formatResult({
          success: true,
          commitSha: response.commit.sha,
          commitUrl: response.commit.html_url
        });
      } catch (error) {
        logger.error('Error in github_delete_file:', error);
        throw error;
      }
    }
  },

  // Pull Request Operations
  github_list_pull_requests: {
    description: 'List pull requests in a GitHub repository',
    inputSchema: ListPullRequestsInputSchema,
    outputSchema: PullRequestListOutputSchema,
    handler: async (input: z.infer<typeof ListPullRequestsInputSchema>) => {
      try {
        logger.info('Listing GitHub pull requests', { owner: input.owner, repo: input.repo });
        const prs = await githubClient.listPullRequests(input.owner, input.repo, {
          state: input.state,
          head: input.head,
          base: input.base,
          sort: input.sort,
          direction: input.direction,
          page: input.page,
          per_page: input.perPage
        });
        
        return formatResult({
          pullRequests: prs.map(pr => ({
            id: pr.id,
            number: pr.number,
            title: pr.title,
            state: pr.state,
            body: pr.body,
            user: pr.user.login,
            head: pr.head.label,
            base: pr.base.label,
            draft: pr.draft,
            createdAt: pr.created_at,
            updatedAt: pr.updated_at,
            mergedAt: pr.merged_at,
            htmlUrl: pr.html_url
          }))
        });
      } catch (error) {
        logger.error('Error in github_list_pull_requests:', error);
        throw error;
      }
    }
  },

  github_get_pull_request: {
    description: 'Get details of a specific pull request',
    inputSchema: GetPullRequestInputSchema,
    outputSchema: PullRequestOutputSchema,
    handler: async (input: z.infer<typeof GetPullRequestInputSchema>) => {
      try {
        logger.info('Getting GitHub pull request', { owner: input.owner, repo: input.repo, pr: input.pullNumber });
        const pr = await githubClient.getPullRequest(input.owner, input.repo, input.pullNumber);
        
        return formatResult({
          id: pr.id,
          number: pr.number,
          title: pr.title,
          state: pr.state,
          body: pr.body,
          user: pr.user.login,
          head: pr.head.label,
          base: pr.base.label,
          draft: pr.draft,
          createdAt: pr.created_at,
          updatedAt: pr.updated_at,
          mergedAt: pr.merged_at,
          htmlUrl: pr.html_url
        });
      } catch (error) {
        logger.error('Error in github_get_pull_request:', error);
        throw error;
      }
    }
  },

  github_merge_pull_request: {
    description: 'Merge a pull request',
    inputSchema: MergePullRequestInputSchema,
    outputSchema: MergePullRequestOutputSchema,
    handler: async (input: z.infer<typeof MergePullRequestInputSchema>) => {
      try {
        logger.info('Merging GitHub pull request', { owner: input.owner, repo: input.repo, pr: input.pullNumber });
        const result = await githubClient.mergePullRequest(input.owner, input.repo, input.pullNumber, {
          commit_title: input.commitTitle,
          commit_message: input.commitMessage,
          sha: input.sha,
          merge_method: input.mergeMethod
        });
        
        return formatResult({
          sha: result.sha,
          merged: result.merged,
          message: result.message
        });
      } catch (error) {
        logger.error('Error in github_merge_pull_request:', error);
        throw error;
      }
    }
  },

  // Collaborator Operations
  github_list_collaborators: {
    description: 'List collaborators in a GitHub repository',
    inputSchema: ListCollaboratorsInputSchema,
    outputSchema: CollaboratorListOutputSchema,
    handler: async (input: z.infer<typeof ListCollaboratorsInputSchema>) => {
      try {
        logger.info('Listing GitHub collaborators', { owner: input.owner, repo: input.repo });
        const collaborators = await githubClient.listCollaborators(input.owner, input.repo, input.page, input.perPage);
        
        return formatResult({
          collaborators: collaborators.map(collab => ({
            login: collab.login,
            id: collab.id,
            avatarUrl: collab.avatar_url,
            htmlUrl: collab.html_url,
            permissions: collab.permissions
          }))
        });
      } catch (error) {
        logger.error('Error in github_list_collaborators:', error);
        throw error;
      }
    }
  },

  github_add_collaborator: {
    description: 'Add a collaborator to a GitHub repository',
    inputSchema: AddCollaboratorInputSchema,
    outputSchema: z.object({ success: z.boolean(), message: z.string() }),
    handler: async (input: z.infer<typeof AddCollaboratorInputSchema>) => {
      try {
        logger.info('Adding GitHub collaborator', { owner: input.owner, repo: input.repo, username: input.username });
        await githubClient.addCollaborator(input.owner, input.repo, input.username, input.permission);
        
        return formatResult({
          success: true,
          message: `Invited ${input.username} to ${input.owner}/${input.repo} with ${input.permission} permission`
        });
      } catch (error) {
        logger.error('Error in github_add_collaborator:', error);
        throw error;
      }
    }
  },

  github_remove_collaborator: {
    description: 'Remove a collaborator from a GitHub repository',
    inputSchema: RemoveCollaboratorInputSchema,
    outputSchema: z.object({ success: z.boolean(), message: z.string() }),
    handler: async (input: z.infer<typeof RemoveCollaboratorInputSchema>) => {
      try {
        logger.info('Removing GitHub collaborator', { owner: input.owner, repo: input.repo, username: input.username });
        await githubClient.removeCollaborator(input.owner, input.repo, input.username);
        
        return formatResult({
          success: true,
          message: `Removed ${input.username} from ${input.owner}/${input.repo}`
        });
      } catch (error) {
        logger.error('Error in github_remove_collaborator:', error);
        throw error;
      }
    }
  },

  // Release Operations
  github_list_releases: {
    description: 'List releases in a GitHub repository',
    inputSchema: ListReleasesInputSchema,
    outputSchema: ReleaseListOutputSchema,
    handler: async (input: z.infer<typeof ListReleasesInputSchema>) => {
      try {
        logger.info('Listing GitHub releases', { owner: input.owner, repo: input.repo });
        const releases = await githubClient.listReleases(input.owner, input.repo, input.page, input.perPage);
        
        return formatResult({
          releases: releases.map(release => ({
            id: release.id,
            tagName: release.tag_name,
            targetCommitish: release.target_commitish,
            name: release.name,
            body: release.body,
            draft: release.draft,
            prerelease: release.prerelease,
            createdAt: release.created_at,
            publishedAt: release.published_at,
            author: release.author.login,
            htmlUrl: release.html_url,
            tarballUrl: release.tarball_url,
            zipballUrl: release.zipball_url
          }))
        });
      } catch (error) {
        logger.error('Error in github_list_releases:', error);
        throw error;
      }
    }
  },

  github_create_release: {
    description: 'Create a new release in a GitHub repository',
    inputSchema: CreateReleaseInputSchema,
    outputSchema: ReleaseOutputSchema,
    handler: async (input: z.infer<typeof CreateReleaseInputSchema>) => {
      try {
        logger.info('Creating GitHub release', { owner: input.owner, repo: input.repo, tag: input.tagName });
        const release = await githubClient.createRelease(input.owner, input.repo, {
          tag_name: input.tagName,
          target_commitish: input.targetCommitish,
          name: input.name,
          body: input.body,
          draft: input.draft,
          prerelease: input.prerelease,
          generate_release_notes: input.generateReleaseNotes
        });
        
        return formatResult({
          id: release.id,
          tagName: release.tag_name,
          targetCommitish: release.target_commitish,
          name: release.name,
          body: release.body,
          draft: release.draft,
          prerelease: release.prerelease,
          createdAt: release.created_at,
          publishedAt: release.published_at,
          author: release.author.login,
          htmlUrl: release.html_url,
          tarballUrl: release.tarball_url,
          zipballUrl: release.zipball_url
        });
      } catch (error) {
        logger.error('Error in github_create_release:', error);
        throw error;
      }
    }
  }
};
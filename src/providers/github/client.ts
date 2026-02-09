import axios, { AxiosInstance, AxiosError } from 'axios';
import { config } from '../../config/index.js';
import { mcpLogger as logger } from '../../utils/logger.js';
import type { 
  GitHubRepository, 
  GitHubIssue, 
  GitHubPullRequest,
  GitHubBranch,
  GitHubReference,
  GitHubCommit,
  GitHubContent,
  GitHubCollaborator,
  GitHubRelease,
  CreateIssueRequest,
  CreatePullRequestRequest,
  CreateRepositoryRequest,
  UpdateRepositoryRequest,
  CreateBranchRequest,
  CreateOrUpdateFileRequest,
  DeleteFileRequest,
  FileCommitResponse,
  ListPullRequestsParams,
  MergePullRequestRequest,
  MergePullRequestResponse,
  ForkRepositoryRequest,
  CreateReleaseRequest
} from './types.js';

export class GitHubClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: config.github.baseUrl,
      timeout: 10000,
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${config.github.token}`,
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        logger.error('GitHub API Error:', {
          status: error.response?.status,
          data: error.response?.data,
          url: error.config?.url
        });
        return Promise.reject(error);
      }
    );
  }

  async listRepositories(
    username: string = '', 
    page: number = 1, 
    perPage: number = 30
  ): Promise<GitHubRepository[]> {
    try {
      const endpoint = username ? `/users/${username}/repos` : '/user/repos';
      const response = await this.client.get<GitHubRepository[]>(endpoint, {
        params: {
          page,
          per_page: perPage,
          sort: 'updated',
          direction: 'desc'
        }
      });
      return response.data;
    } catch (error) {
      logger.error('Failed to list repositories:', error);
      throw new Error('Failed to list GitHub repositories');
    }
  }

  async getRepository(owner: string, repo: string): Promise<GitHubRepository> {
    try {
      const response = await this.client.get<GitHubRepository>(`/repos/${owner}/${repo}`);
      return response.data;
    } catch (error) {
      logger.error('Failed to get repository:', error);
      throw new Error(`Failed to get repository ${owner}/${repo}`);
    }
  }

  async listIssues(
    owner: string, 
    repo: string, 
    state: string = 'open',
    page: number = 1,
    perPage: number = 30
  ): Promise<GitHubIssue[]> {
    try {
      const response = await this.client.get<GitHubIssue[]>(`/repos/${owner}/${repo}/issues`, {
        params: {
          state,
          page,
          per_page: perPage,
          sort: 'created',
          direction: 'desc'
        }
      });
      return response.data;
    } catch (error) {
      logger.error('Failed to list issues:', error);
      throw new Error(`Failed to list issues for ${owner}/${repo}`);
    }
  }

  async createIssue(
    owner: string, 
    repo: string, 
    request: CreateIssueRequest
  ): Promise<GitHubIssue> {
    try {
      const response = await this.client.post<GitHubIssue>(
        `/repos/${owner}/${repo}/issues`,
        request
      );
      return response.data;
    } catch (error) {
      logger.error('Failed to create issue:', error);
      throw new Error(`Failed to create issue in ${owner}/${repo}`);
    }
  }

  async createPullRequest(
    owner: string, 
    repo: string, 
    request: CreatePullRequestRequest
  ): Promise<GitHubPullRequest> {
    try {
      const response = await this.client.post<GitHubPullRequest>(
        `/repos/${owner}/${repo}/pulls`,
        request
      );
      return response.data;
    } catch (error) {
      logger.error('Failed to create pull request:', error);
      throw new Error(`Failed to create pull request in ${owner}/${repo}`);
    }
  }

  async getAuthenticatedUser(): Promise<{ login: string; id: number }> {
    try {
      const response = await this.client.get<{ login: string; id: number }>('/user');
      return response.data;
    } catch (error) {
      logger.error('Failed to get authenticated user:', error);
      throw new Error('Failed to get authenticated GitHub user');
    }
  }

  // Repository Management
  async createRepository(request: CreateRepositoryRequest): Promise<GitHubRepository> {
    try {
      const response = await this.client.post<GitHubRepository>('/user/repos', request);
      return response.data;
    } catch (error) {
      logger.error('Failed to create repository:', error);
      throw new Error('Failed to create GitHub repository');
    }
  }

  async updateRepository(owner: string, repo: string, request: UpdateRepositoryRequest): Promise<GitHubRepository> {
    try {
      const response = await this.client.patch<GitHubRepository>(`/repos/${owner}/${repo}`, request);
      return response.data;
    } catch (error) {
      logger.error('Failed to update repository:', error);
      throw new Error(`Failed to update repository ${owner}/${repo}`);
    }
  }

  async deleteRepository(owner: string, repo: string): Promise<void> {
    try {
      await this.client.delete(`/repos/${owner}/${repo}`);
    } catch (error) {
      logger.error('Failed to delete repository:', error);
      throw new Error(`Failed to delete repository ${owner}/${repo}`);
    }
  }

  async forkRepository(owner: string, repo: string, request?: ForkRepositoryRequest): Promise<GitHubRepository> {
    try {
      const response = await this.client.post<GitHubRepository>(`/repos/${owner}/${repo}/forks`, request || {});
      return response.data;
    } catch (error) {
      logger.error('Failed to fork repository:', error);
      throw new Error(`Failed to fork repository ${owner}/${repo}`);
    }
  }

  // Branch Operations
  async listBranches(owner: string, repo: string, page: number = 1, perPage: number = 30): Promise<GitHubBranch[]> {
    try {
      const response = await this.client.get<GitHubBranch[]>(`/repos/${owner}/${repo}/branches`, {
        params: { page, per_page: perPage }
      });
      return response.data;
    } catch (error) {
      logger.error('Failed to list branches:', error);
      throw new Error(`Failed to list branches for ${owner}/${repo}`);
    }
  }

  async getBranch(owner: string, repo: string, branch: string): Promise<GitHubBranch> {
    try {
      const response = await this.client.get<GitHubBranch>(`/repos/${owner}/${repo}/branches/${branch}`);
      return response.data;
    } catch (error) {
      logger.error('Failed to get branch:', error);
      throw new Error(`Failed to get branch ${branch} from ${owner}/${repo}`);
    }
  }

  async createBranch(owner: string, repo: string, request: CreateBranchRequest): Promise<GitHubReference> {
    try {
      const response = await this.client.post<GitHubReference>(`/repos/${owner}/${repo}/git/refs`, {
        ref: `refs/heads/${request.ref}`,
        sha: request.sha
      });
      return response.data;
    } catch (error) {
      logger.error('Failed to create branch:', error);
      throw new Error(`Failed to create branch in ${owner}/${repo}`);
    }
  }

  // Commit Operations
  async listCommits(
    owner: string, 
    repo: string, 
    branch: string = '',
    page: number = 1, 
    perPage: number = 30
  ): Promise<GitHubCommit[]> {
    try {
      const params: Record<string, string | number> = { page, per_page: perPage };
      if (branch) params.sha = branch;
      const response = await this.client.get<GitHubCommit[]>(`/repos/${owner}/${repo}/commits`, { params });
      return response.data;
    } catch (error) {
      logger.error('Failed to list commits:', error);
      throw new Error(`Failed to list commits for ${owner}/${repo}`);
    }
  }

  async getCommit(owner: string, repo: string, sha: string): Promise<GitHubCommit> {
    try {
      const response = await this.client.get<GitHubCommit>(`/repos/${owner}/${repo}/commits/${sha}`);
      return response.data;
    } catch (error) {
      logger.error('Failed to get commit:', error);
      throw new Error(`Failed to get commit ${sha} from ${owner}/${repo}`);
    }
  }

  // File/Content Operations
  async getRepositoryContent(owner: string, repo: string, path: string = '', ref?: string): Promise<GitHubContent | GitHubContent[]> {
    try {
      const params: Record<string, string> = {};
      if (ref) params.ref = ref;
      const response = await this.client.get<GitHubContent | GitHubContent[]>(`/repos/${owner}/${repo}/contents/${path}`, { params });
      return response.data;
    } catch (error) {
      logger.error('Failed to get repository content:', error);
      throw new Error(`Failed to get content from ${owner}/${repo}`);
    }
  }

  async createOrUpdateFile(
    owner: string, 
    repo: string, 
    path: string, 
    request: CreateOrUpdateFileRequest
  ): Promise<FileCommitResponse> {
    try {
      const response = await this.client.put<FileCommitResponse>(`/repos/${owner}/${repo}/contents/${path}`, request);
      return response.data;
    } catch (error) {
      logger.error('Failed to create/update file:', error);
      throw new Error(`Failed to create/update file in ${owner}/${repo}`);
    }
  }

  async deleteFile(owner: string, repo: string, path: string, request: DeleteFileRequest): Promise<FileCommitResponse> {
    try {
      const response = await this.client.delete<FileCommitResponse>(`/repos/${owner}/${repo}/contents/${path}`, {
        data: request
      });
      return response.data;
    } catch (error) {
      logger.error('Failed to delete file:', error);
      throw new Error(`Failed to delete file from ${owner}/${repo}`);
    }
  }

  // Pull Request Operations
  async listPullRequests(
    owner: string, 
    repo: string, 
    params: ListPullRequestsParams = {}
  ): Promise<GitHubPullRequest[]> {
    try {
      const response = await this.client.get<GitHubPullRequest[]>(`/repos/${owner}/${repo}/pulls`, {
        params: {
          state: params.state || 'open',
          head: params.head,
          base: params.base,
          sort: params.sort || 'created',
          direction: params.direction || 'desc',
          page: params.page || 1,
          per_page: params.per_page || 30
        }
      });
      return response.data;
    } catch (error) {
      logger.error('Failed to list pull requests:', error);
      throw new Error(`Failed to list pull requests for ${owner}/${repo}`);
    }
  }

  async getPullRequest(owner: string, repo: string, pullNumber: number): Promise<GitHubPullRequest> {
    try {
      const response = await this.client.get<GitHubPullRequest>(`/repos/${owner}/${repo}/pulls/${pullNumber}`);
      return response.data;
    } catch (error) {
      logger.error('Failed to get pull request:', error);
      throw new Error(`Failed to get pull request #${pullNumber} from ${owner}/${repo}`);
    }
  }

  async mergePullRequest(
    owner: string, 
    repo: string, 
    pullNumber: number, 
    request: MergePullRequestRequest = {}
  ): Promise<MergePullRequestResponse> {
    try {
      const response = await this.client.put<MergePullRequestResponse>(`/repos/${owner}/${repo}/pulls/${pullNumber}/merge`, request);
      return response.data;
    } catch (error) {
      logger.error('Failed to merge pull request:', error);
      throw new Error(`Failed to merge pull request #${pullNumber} in ${owner}/${repo}`);
    }
  }

  // Collaborator Operations
  async listCollaborators(owner: string, repo: string, page: number = 1, perPage: number = 30): Promise<GitHubCollaborator[]> {
    try {
      const response = await this.client.get<GitHubCollaborator[]>(`/repos/${owner}/${repo}/collaborators`, {
        params: { page, per_page: perPage }
      });
      return response.data;
    } catch (error) {
      logger.error('Failed to list collaborators:', error);
      throw new Error(`Failed to list collaborators for ${owner}/${repo}`);
    }
  }

  async addCollaborator(owner: string, repo: string, username: string, permission: string = 'push'): Promise<void> {
    try {
      await this.client.put(`/repos/${owner}/${repo}/collaborators/${username}`, { permission });
    } catch (error) {
      logger.error('Failed to add collaborator:', error);
      throw new Error(`Failed to add collaborator ${username} to ${owner}/${repo}`);
    }
  }

  async removeCollaborator(owner: string, repo: string, username: string): Promise<void> {
    try {
      await this.client.delete(`/repos/${owner}/${repo}/collaborators/${username}`);
    } catch (error) {
      logger.error('Failed to remove collaborator:', error);
      throw new Error(`Failed to remove collaborator ${username} from ${owner}/${repo}`);
    }
  }

  // Release Operations
  async listReleases(owner: string, repo: string, page: number = 1, perPage: number = 30): Promise<GitHubRelease[]> {
    try {
      const response = await this.client.get<GitHubRelease[]>(`/repos/${owner}/${repo}/releases`, {
        params: { page, per_page: perPage }
      });
      return response.data;
    } catch (error) {
      logger.error('Failed to list releases:', error);
      throw new Error(`Failed to list releases for ${owner}/${repo}`);
    }
  }

  async createRelease(owner: string, repo: string, request: CreateReleaseRequest): Promise<GitHubRelease> {
    try {
      const response = await this.client.post<GitHubRelease>(`/repos/${owner}/${repo}/releases`, request);
      return response.data;
    } catch (error) {
      logger.error('Failed to create release:', error);
      throw new Error(`Failed to create release in ${owner}/${repo}`);
    }
  }
}
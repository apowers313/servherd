import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { CIDetector } from "../../../src/utils/ci-detector.js";

describe("CI detector additional platforms", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Create a clean copy of environment variables
    process.env = { ...originalEnv };
    // Clear all CI-related environment variables
    delete process.env.CI;
    delete process.env.GITHUB_ACTIONS;
    delete process.env.GITLAB_CI;
    delete process.env.CIRCLECI;
    delete process.env.TRAVIS;
    delete process.env.JENKINS_URL;
    delete process.env.BUILDKITE;
    delete process.env.AZURE_PIPELINES;
    delete process.env.TEAMCITY_VERSION;
    delete process.env.TF_BUILD;
    delete process.env.CODEBUILD_BUILD_ID;
    delete process.env.DRONE;
    delete process.env.BITBUCKET_COMMIT;
    delete process.env.SEMAPHORE;
    delete process.env.RENDER;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should detect Azure DevOps", () => {
    process.env.TF_BUILD = "True";
    expect(CIDetector.isCI()).toBe(true);
    expect(CIDetector.getCIName()).toBe("Azure DevOps");
  });

  it("should detect AWS CodeBuild", () => {
    process.env.CODEBUILD_BUILD_ID = "build:123";
    expect(CIDetector.isCI()).toBe(true);
    expect(CIDetector.getCIName()).toBe("AWS CodeBuild");
  });

  it("should detect Drone CI", () => {
    process.env.DRONE = "true";
    expect(CIDetector.isCI()).toBe(true);
    expect(CIDetector.getCIName()).toBe("Drone CI");
  });

  it("should detect Bitbucket Pipelines", () => {
    process.env.BITBUCKET_COMMIT = "abc123";
    expect(CIDetector.isCI()).toBe(true);
    expect(CIDetector.getCIName()).toBe("Bitbucket Pipelines");
  });

  it("should detect Semaphore", () => {
    process.env.SEMAPHORE = "true";
    expect(CIDetector.isCI()).toBe(true);
    expect(CIDetector.getCIName()).toBe("Semaphore");
  });

  it("should detect Render", () => {
    process.env.RENDER = "true";
    expect(CIDetector.isCI()).toBe(true);
    expect(CIDetector.getCIName()).toBe("Render");
  });
});

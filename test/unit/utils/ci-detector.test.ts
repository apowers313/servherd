import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { CIDetector } from "../../../src/utils/ci-detector.js";

describe("CIDetector", () => {
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
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("isCI", () => {
    it("should detect GitHub Actions", () => {
      process.env.GITHUB_ACTIONS = "true";
      expect(CIDetector.isCI()).toBe(true);
    });

    it("should detect GitLab CI", () => {
      process.env.GITLAB_CI = "true";
      expect(CIDetector.isCI()).toBe(true);
    });

    it("should detect CircleCI", () => {
      process.env.CIRCLECI = "true";
      expect(CIDetector.isCI()).toBe(true);
    });

    it("should detect Travis CI", () => {
      process.env.TRAVIS = "true";
      expect(CIDetector.isCI()).toBe(true);
    });

    it("should detect Jenkins", () => {
      process.env.JENKINS_URL = "http://jenkins.example.com";
      expect(CIDetector.isCI()).toBe(true);
    });

    it("should detect generic CI environment variable", () => {
      process.env.CI = "true";
      expect(CIDetector.isCI()).toBe(true);
    });

    it("should return false when not in CI", () => {
      expect(CIDetector.isCI()).toBe(false);
    });

    it("should respect --ci flag option", () => {
      // Not in CI environment, but --ci flag is passed
      expect(CIDetector.isCI({ ci: true })).toBe(true);
    });

    it("should respect --no-ci flag option to override CI environment", () => {
      // In CI environment, but --no-ci flag is passed
      process.env.CI = "true";
      expect(CIDetector.isCI({ noCi: true })).toBe(false);
    });

    it("should prioritize --no-ci over --ci when both are set", () => {
      // Both flags set (edge case) - --no-ci takes precedence
      expect(CIDetector.isCI({ ci: true, noCi: true })).toBe(false);
    });

    it("should prioritize --no-ci over environment variables", () => {
      process.env.GITHUB_ACTIONS = "true";
      expect(CIDetector.isCI({ noCi: true })).toBe(false);
    });

    it("should use environment detection when no options provided", () => {
      process.env.CI = "true";
      expect(CIDetector.isCI({})).toBe(true);
    });

    it("should use environment detection when undefined options provided", () => {
      process.env.CI = "true";
      expect(CIDetector.isCI(undefined)).toBe(true);
    });
  });

  describe("getCIName", () => {
    it("should return 'GitHub Actions' when GITHUB_ACTIONS is set", () => {
      process.env.GITHUB_ACTIONS = "true";
      expect(CIDetector.getCIName()).toBe("GitHub Actions");
    });

    it("should return 'GitLab CI' when GITLAB_CI is set", () => {
      process.env.GITLAB_CI = "true";
      expect(CIDetector.getCIName()).toBe("GitLab CI");
    });

    it("should return 'CircleCI' when CIRCLECI is set", () => {
      process.env.CIRCLECI = "true";
      expect(CIDetector.getCIName()).toBe("CircleCI");
    });

    it("should return 'Travis CI' when TRAVIS is set", () => {
      process.env.TRAVIS = "true";
      expect(CIDetector.getCIName()).toBe("Travis CI");
    });

    it("should return 'Jenkins' when JENKINS_URL is set", () => {
      process.env.JENKINS_URL = "http://jenkins.example.com";
      expect(CIDetector.getCIName()).toBe("Jenkins");
    });

    it("should return 'Buildkite' when BUILDKITE is set", () => {
      process.env.BUILDKITE = "true";
      expect(CIDetector.getCIName()).toBe("Buildkite");
    });

    it("should return 'Azure Pipelines' when AZURE_PIPELINES is set", () => {
      process.env.AZURE_PIPELINES = "true";
      expect(CIDetector.getCIName()).toBe("Azure Pipelines");
    });

    it("should return 'TeamCity' when TEAMCITY_VERSION is set", () => {
      process.env.TEAMCITY_VERSION = "2023.1";
      expect(CIDetector.getCIName()).toBe("TeamCity");
    });

    it("should return 'Unknown CI' when only CI=true is set", () => {
      process.env.CI = "true";
      expect(CIDetector.getCIName()).toBe("Unknown CI");
    });

    it("should return null when not in CI", () => {
      expect(CIDetector.getCIName()).toBeNull();
    });
  });

  describe("getInfo", () => {
    it("should return complete CI info for GitHub Actions", () => {
      process.env.GITHUB_ACTIONS = "true";
      const info = CIDetector.getInfo();
      expect(info.isCI).toBe(true);
      expect(info.name).toBe("GitHub Actions");
    });

    it("should return isCI: false when not in CI", () => {
      const info = CIDetector.getInfo();
      expect(info.isCI).toBe(false);
      expect(info.name).toBeNull();
    });
  });
});

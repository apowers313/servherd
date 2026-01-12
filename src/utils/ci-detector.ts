/**
 * CI Environment Detector
 * Detects various CI/CD environments and provides information about them.
 */

export interface CIInfo {
  isCI: boolean;
  name: string | null;
}

/**
 * Options for CI detection that can be passed from CLI flags
 */
export interface CIModeOptions {
  ci?: boolean;
  noCi?: boolean;
}

interface CIEnvironment {
  name: string;
  envVar: string;
}

const CI_ENVIRONMENTS: CIEnvironment[] = [
  { name: "GitHub Actions", envVar: "GITHUB_ACTIONS" },
  { name: "GitLab CI", envVar: "GITLAB_CI" },
  { name: "CircleCI", envVar: "CIRCLECI" },
  { name: "Travis CI", envVar: "TRAVIS" },
  { name: "Jenkins", envVar: "JENKINS_URL" },
  { name: "Buildkite", envVar: "BUILDKITE" },
  { name: "Azure Pipelines", envVar: "AZURE_PIPELINES" },
  { name: "TeamCity", envVar: "TEAMCITY_VERSION" },
];

export class CIDetector {
  /**
   * Check if running in a CI environment
   * @param options Optional CLI flags to override environment detection
   */
  static isCI(options?: CIModeOptions): boolean {
    // Explicit --no-ci flag takes highest precedence
    if (options?.noCi) {
      return false;
    }

    // Explicit --ci flag takes precedence over environment detection
    if (options?.ci) {
      return true;
    }

    // Fall back to environment variable detection
    // Check for generic CI environment variable
    if (process.env.CI) {
      return true;
    }

    // Check for specific CI environments
    for (const ci of CI_ENVIRONMENTS) {
      if (process.env[ci.envVar]) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get the name of the CI environment
   * Returns null if not running in CI
   */
  static getCIName(): string | null {
    // Check for specific CI environments first
    for (const ci of CI_ENVIRONMENTS) {
      if (process.env[ci.envVar]) {
        return ci.name;
      }
    }

    // Check for generic CI environment variable
    if (process.env.CI) {
      return "Unknown CI";
    }

    return null;
  }

  /**
   * Get complete CI information
   */
  static getInfo(): CIInfo {
    return {
      isCI: this.isCI(),
      name: this.getCIName(),
    };
  }
}

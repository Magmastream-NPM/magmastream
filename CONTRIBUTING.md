# Contributing to Magmastream

Thank you for your interest in contributing to Magmastream! We welcome contributions from everyone, whether you're fixing a typo, improving documentation, adding a new feature, or reporting a bug.

This document provides guidelines and steps for contributing to Magmastream. By following these guidelines, you help maintain the quality and consistency of the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Documentation](#documentation)
- [Community](#community)

## Code of Conduct

We expect all contributors to adhere to our Code of Conduct. Please read it before participating.

- Be respectful and inclusive
- Be patient and welcoming
- Be thoughtful
- Be collaborative
- When disagreeing, try to understand why

## Getting Started

### Prerequisites

- Node.js (v16.x or higher)
- npm (v7.x or higher)
- A running [Lavalink](https://github.com/freyacodes/Lavalink) server for testing

### Setup

1. Fork the repository on GitHub
2. Clone your fork locally:
   ```bash
   git clone https://github.com/YOUR-USERNAME/magmastream.git
   cd magmastream
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Add the original repository as a remote:
   ```bash
   git remote add upstream https://github.com/Magmastream-NPM/magmastream.git
   ```

## Development Workflow

1. Create a new branch for your feature/fix:
   ```bash
   git checkout -b feature/your-feature-name
   ```
   or
   ```bash
   git checkout -b fix/issue-you-are-fixing
   ```

2. Make your changes

3. Run tests to ensure your changes don't break existing functionality:
   ```bash
   npm test
   ```

4. Commit your changes with a descriptive message:
   ```bash
   git commit -m "feat: add new audio filter functionality"
   ```
   We follow [Conventional Commits](https://www.conventionalcommits.org/) for commit messages.
   Also take a look at [this](https://www.freecodecamp.org/news/how-to-write-better-git-commit-messages/) tutorial for more information.

5. Push to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```

6. Create a Pull Request from your fork to the [dev](https://github.com/Magmastream-NPM/magmastream/tree/dev) branch

## Pull Request Process

1. Ensure your PR addresses a specific issue. If an issue doesn't exist, create one first.
2. Update documentation if necessary.
3. Include tests for new features.
4. Make sure all tests pass.
5. Wait for code review and address any requested changes.
6. Once approved, a maintainer will merge your PR.

## Coding Standards

We follow a set of coding standards to maintain consistency across the codebase:

- Use ESLint for code linting
- Follow the existing code style
- Write clear, descriptive variable and function names
- Comment complex code sections
- Keep functions small and focused on a single task
- Use TypeScript for type safety

### TypeScript Guidelines

- Use proper typing instead of `any` wherever possible
- Make interfaces for complex objects
- Use enums for predefined values
- Leverage union types and generics when appropriate

## Testing

All new features and bug fixes should include tests. We use Jest for testing.

- Unit tests for individual functions and methods
- Integration tests for API endpoints and complex interactions
- Make sure your tests are meaningful and cover edge cases

To run tests:
```bash
npm test
```

## Documentation

Good documentation is crucial for the project:

- Update the README.md if necessary
- Document all public methods and classes with JSDoc comments
- Include examples for non-trivial functionality
- Update the changelog for significant changes

## Community

Join our community to discuss development, get help, or chat:

- [Discord Server](https://discord.gg/wrydAnP3M6)
- [GitHub Discussions](https://github.com/Magmastream-NPM/magmastream/discussions)

## Plugin Development

If you're creating a plugin for Magmastream:

1. Use the official plugin template
2. Follow the plugin development guidelines
3. Make sure your plugin is well-documented
4. Include tests for your plugin functionality

## Releasing

Only maintainers can release new versions. The process is:

1. Update version in package.json
2. Update CHANGELOG.md
3. Create a GitHub release
4. Publish to npm

## Questions?

If you have any questions about contributing, please reach out on our Discord server or open an issue on GitHub.

Thank you for contributing to Magmastream!

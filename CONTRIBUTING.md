# Contributing to QuickMark

Thank you for your interest in contributing to QuickMark! This document provides guidelines and instructions for contributing.

## Code of Conduct

- Be respectful and inclusive
- Focus on constructive feedback
- Help create a welcoming environment for all contributors

## How to Contribute

### Reporting Bugs

1. Check if the bug has already been reported in [Issues](https://github.com/drkpxl/quickmark/issues)
2. If not, create a new issue with:
   - Clear, descriptive title
   - Steps to reproduce the bug
   - Expected vs actual behavior
   - Screenshots if applicable
   - Environment details (OS, browser, Docker version, etc.)

### Suggesting Enhancements

1. Check existing issues and discussions first
2. Create an issue describing:
   - The enhancement and its benefits
   - Potential implementation approach
   - Any breaking changes or compatibility concerns

### Pull Requests

1. **Fork the repository** and create a new branch from `main`

2. **Set up your development environment**:
   ```bash
   git clone https://github.com/YOUR-USERNAME/quickmark.git
   cd quickmark
   npm install
   npm run dev
   ```

3. **Make your changes**:
   - Follow existing code style and patterns
   - Use TypeScript for type safety
   - Keep commits atomic and well-described
   - Test your changes locally

4. **Test your changes**:
   ```bash
   # Development mode
   npm run dev

   # Production build
   npm run build
   npm run preview

   # Docker build (if applicable)
   docker-compose build
   docker-compose up
   ```

5. **Commit your changes**:
   ```bash
   git add .
   git commit -m "Brief description of changes"
   ```

   Use clear commit messages following this format:
   - `feat: Add new feature`
   - `fix: Fix bug in bookmark deletion`
   - `docs: Update README`
   - `style: Format code`
   - `refactor: Restructure metadata extraction`
   - `perf: Improve search performance`
   - `test: Add tests for export functionality`

6. **Push to your fork**:
   ```bash
   git push origin your-branch-name
   ```

7. **Open a Pull Request**:
   - Provide a clear description of the changes
   - Reference any related issues
   - Explain the motivation and context
   - Include screenshots for UI changes

## Development Guidelines

### Code Style

- **TypeScript**: Use TypeScript for all new code
- **Svelte 5**: Use runes (`$state`, `$derived`, `$props`) for reactivity
- **Formatting**: Code is auto-formatted (maintain consistency with existing code)
- **Comments**: Add comments for complex logic, but prefer self-documenting code

### Project Structure

```
src/
├── routes/              # SvelteKit routes
│   ├── +layout.svelte   # Global layout
│   ├── +page.svelte     # Main page
│   └── api/             # API endpoints
└── lib/
    └── server/          # Server-only code
        ├── db.ts        # Database operations
        └── metadata.ts  # Metadata extraction
```

### Database Changes

If you need to modify the database schema:

1. Update the schema in `src/lib/server/db.ts`
2. Add migration logic that handles existing databases
3. Test with both fresh and existing databases
4. Document the changes in your PR

### Adding Dependencies

- Minimize new dependencies when possible
- Prefer well-maintained packages
- Ensure compatibility with Node.js 22
- Update `package.json` and include in PR description

## Testing

Currently, QuickMark uses manual testing. When adding new features:

1. Test all affected functionality
2. Test in both light and dark themes
3. Test keyboard shortcuts
4. Test responsive design (mobile and desktop)
5. Test with Docker build

Future contributions adding automated testing are welcome!

## Documentation

- Update README.md for user-facing changes
- Update code comments for internal changes
- Add JSDoc comments for new functions
- Update this CONTRIBUTING.md if contributing process changes

## Release Process

Releases are automated via GitHub Actions:

1. Version is tagged (e.g., `v1.0.0`)
2. Docker images are built for multiple platforms
3. Images are pushed to GitHub Container Registry
4. GitHub Release is created automatically

Only maintainers can create releases.

## Getting Help

- **Questions**: Open a [Discussion](https://github.com/drkpxl/quickmark/discussions)
- **Bugs**: Create an [Issue](https://github.com/drkpxl/quickmark/issues)
- **Chat**: (Add Discord/Matrix link if available)

## Areas for Contribution

Some areas where contributions would be particularly valuable:

- **Testing**: Add unit tests, integration tests, or E2E tests
- **Accessibility**: Improve keyboard navigation, screen reader support
- **Mobile**: Enhance mobile experience
- **Performance**: Optimize load times, bundle size
- **Features**: See open issues tagged with "enhancement"
- **Documentation**: Improve guides, add examples
- **Localization**: Add internationalization support

## Recognition

All contributors will be recognized in the project. Thank you for making QuickMark better!

---

**Questions?** Feel free to ask in an issue or discussion. We're here to help!

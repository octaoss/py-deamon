# Redesign PyDaemon — Vercel-Inspired SaaS Dashboard

## Objective

Redesign the existing PyDaemon dashboard into a modern, minimal, professional SaaS dashboard inspired by Vercel's design system and developer experience.

Use the uploaded screenshot as the reference for the current application. The final interface should feel like a polished developer platform rather than a generic admin dashboard.

**Design direction:** Vercel-inspired, monochromatic, minimal, clean, precise, developer-focused.

Do not copy Vercel's branding or logo. Apply its visual principles to PyDaemon's own identity.

## 1. Design System

### Colors
- Primary background: pure white or near-white.
- Primary text: near-black (`#171717`).
- Secondary text: neutral gray (`#737373`).
- Borders: subtle neutral gray (`#E5E5E5`).
- Cards: white with thin borders, no heavy shadows.
- Primary buttons: black background, white text.
- Interactive states: subtle gray backgrounds and smooth transitions.
- Status colors: reserved green for running/connected, red for destructive actions, and amber for warnings.

Provide a consistent dark theme if the existing application supports one, using neutral dark surfaces instead of introducing unnecessary accent colors.

### Typography
- Use Geist or Geist Sans when available; otherwise use the project's existing modern sans-serif font.
- Use clear typographic hierarchy, compact headings, readable metadata, and consistent font weights.
- Use monospace typography for ports, process IDs, local addresses, and technical values.

### Visual Principles
- Remove excessive rounded cards and decorative visual effects.
- Prefer 8px–12px corner radii, thin borders, and subtle hover states.
- Use consistent spacing based on a 4px/8px spacing scale.
- Avoid gradients, excessive colors, glassmorphism, oversized cards, and unnecessary illustrations.
- Make every element feel intentional and functional.

## 2. Application Header

Redesign the current header into a clean SaaS navigation bar.

Left side:
- PyDaemon logo and application name.
- Small subtitle: "Python Hosting Manager".

Right side:
- Cloudflare connection status, displayed as a compact status indicator or dropdown.
- Primary action button: `+ New Project`.

Use a restrained header height, subtle bottom border, and proper alignment. The header should remain responsive on smaller screens.

## 3. Dashboard Overview

Replace the oversized dashboard statistic cards with a more compact, elegant overview.

Display the following metrics:
- Projects & Routes
- Root Domain
- Cloudflare API Status
- Daemon Uptime

Use minimal typography and subtle separators. Highlight the actual metric value rather than giving every metric a colorful card.

Example layout:

Projects & Routes       Root Domain          Cloudflare API        Daemon Uptime
1                       oktanio.dev          Connected             12m

Do not hardcode these example values. Render actual data from the application's existing state and backend.

## 4. Projects and Routes

Redesign the current ALI-AUDIO card into a more refined project list or compact project panel.

Prefer a clean table/list layout when multiple projects exist, rather than a grid of large cards.

Each project should display:

- Project name, for example `ALI-AUDIO`.
- Running/stopped/error status.
- Public hostname, for example `aliaudio.oktanio.dev`.
- Local target, for example `localhost:8001`.
- Runtime version, such as Python 3.14.10.
- Process ID.
- Project source type, such as Git.
- Available project actions.

Use the following information hierarchy:

1. Project name and running status.
2. Public hostname and local port mapping.
3. Secondary runtime metadata.
4. Actions menu.

The hostname should be clickable. The local target and technical metadata should use subtle monospace styling.

For an empty project list, display a polished empty state with a clear `Create your first project` action.

## 5. Project Actions

Replace the current row of ambiguous icon-only buttons with a clean actions menu or clearly identifiable icon buttons.

Preserve and correctly map all existing functionality, including:

- Start/stop process.
- Restart process.
- View terminal or logs.
- Copy public URL.
- Open public URL.
- Delete project.

Use tooltips for icon-only actions. Give destructive actions a clear confirmation dialog.

Display loading, disabled, success, and error states where appropriate. Never show a successful operation before the underlying action actually succeeds.

## 6. New Project / Route Flow

Redesign the creation flow as a polished modal, dropdown workflow, or dedicated page consistent with modern developer SaaS products.

The form should feel simple and focused, with clearly labeled fields, validation messages, and helpful placeholders.

Reuse the application's existing project configuration fields and validation logic. Do not invent configuration options that the backend cannot support.

The primary action should be visually prominent without being oversized.

## 7. Layout and Responsiveness

- Center the dashboard in a responsive container with a sensible maximum width.
- Use consistent horizontal margins and generous whitespace.
- On desktop, use a balanced overview section followed by the project list.
- On tablet and mobile, collapse columns naturally and prevent horizontal overflow.
- Keep technical metadata readable at smaller widths.
- Avoid excessive empty space and unnecessarily tall cards.
- Ensure the main content has a clear visual hierarchy.

## 8. Interactions and Polish

Implement subtle, professional micro-interactions:

- Smooth but restrained hover transitions.
- Visible keyboard focus states.
- Clear feedback for copying URLs.
- Tooltips for unfamiliar controls.
- Consistent dropdown and modal behavior.
- Skeleton loading states where appropriate.
- Elegant empty, loading, error, and disconnected states.

Follow accessible contrast standards and support keyboard navigation.

## 9. Technical Constraints

Before modifying the UI, inspect the existing codebase and identify its framework, styling system, reusable components, backend integration, and existing interactions.

Then implement the redesign directly in the existing project.

- Reuse existing libraries and components when practical.
- Do not replace the project's framework.
- Do not rewrite backend logic just to accommodate the design.
- Preserve all existing Cloudflare Zero Trust Tunnel API integrations.
- Preserve actual project lifecycle management and process information.
- Keep the application's current data flow and API contracts intact.
- Do not replace live data with mock data or hardcoded placeholders.
- Do not remove any existing features.
- Avoid adding unnecessary dependencies.
- Keep the implementation clean, reusable, and maintainable.

If the codebase already has a theme system, extend it rather than introducing a competing styling mechanism.

## 10. Expected Result

The final PyDaemon interface should resemble the quality of a mature developer SaaS dashboard:

- Minimal Vercel-inspired visual language.
- Crisp typography and refined spacing.
- Thin borders and neutral surfaces.
- Compact project management interface.
- Clear project status and URL mapping.
- Consistent buttons, dropdowns, dialogs, and tooltips.
- Responsive desktop and mobile layouts.
- Fully functional integration with the existing backend.

Do not stop after producing a screenshot, wireframe, or design proposal. Implement the changes in the actual codebase, run the available checks/build, fix any regressions caused by the redesign, and summarize the files changed and functionality verified.

**Priority:** visual quality, functional correctness, consistency, and maintainability—in that order, without sacrificing functionality.


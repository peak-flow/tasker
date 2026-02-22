# ADR-001: Frontend Stack - Alpine.js + Tailwind CSS

## Status
Accepted

## Date
2026-02-22

## Context
We need a frontend framework for a task management app with an infinite-depth tree UI. The app will eventually include multiple feature modules (tasks, second brain). Requirements:
- Reactive UI with minimal boilerplate
- No build step preferred
- Single HTML files per feature module
- Fast iteration speed

## Options Considered
1. **React** - Full SPA framework, requires build tooling, JSX compilation
2. **Vue.js** - Similar to Alpine but heavier, typically needs build step
3. **Alpine.js + Tailwind CSS** - Lightweight, CDN-loadable, reactive, no build step

## Decision
Alpine.js for interactivity + Tailwind CSS for styling, loaded via CDN.

## Rationale
- Alpine.js provides reactive data binding directly in HTML attributes - perfect for tree expand/collapse, inline editing
- No build step means each feature is a self-contained HTML file
- Tailwind via CDN gives utility-first styling without a compilation step
- Both libraries are small enough that CDN loading is fast
- Learning curve is minimal compared to React/Vue

## Consequences
- No component ecosystem (build our own patterns)
- CDN dependency for development (offline requires local copies)
- Each HTML page is self-contained - good for modularity, but shared patterns must be copy-pasted or extracted to shared JS files later

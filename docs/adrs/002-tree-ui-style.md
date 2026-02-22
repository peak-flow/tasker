# ADR-002: Tree UI Style - Indented List (Primary View)

## Status
Accepted

## Date
2026-02-22

## Context
The core feature is an infinite-depth task tree where tasks break down into subtasks via AI. We need a visual representation that:
- Supports unlimited nesting depth
- Is easy to build and extend
- Works well on various screen sizes
- Allows inline interactions (edit, expand/collapse, AI breakdown)

## Options Considered
1. **Vertical org-chart tree** - Nodes connected by lines flowing downward
2. **Indented file-explorer list** - Nested list with tree connector lines
3. **Card-based node graph** - Spatial mind-map with connected cards

All three were prototyped in an interactive playground for comparison.

## Decision
Start with indented list as the primary view. Other styles will be added as alternate views later since the data model is view-agnostic.

## Rationale
- **Simplest to implement** - recursive Alpine.js templates with `x-for`, no coordinate math
- **Scales infinitely** - depth is just padding-left, no layout calculations
- **Most functional** - easy to add inline editing, checkboxes, drag-to-reorder
- **Responsive by default** - works on any screen width
- Vertical tree needs horizontal space management that breaks at 3-4 levels wide
- Card graph needs position calculations and SVG line drawing

## Consequences
- Less visually dramatic than card graph
- Alternate views (vertical tree, card graph) become future work items
- Data model must remain view-agnostic to support multiple renderers

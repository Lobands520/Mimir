# Requirements Document

## Introduction

This project aims to comprehensively refactor the existing "Mimir - Personal Memory Dashboard" browser extension's Dashboard page. The current version has layout issues after CSS theme changes, code redundancy, suboptimal interface layout, and limited data analysis dimensions. The refactoring will modernize the interface with a single-column flow layout, enhance interactivity with collapsible modules, enrich data analysis capabilities, and improve code quality through modularization.

## Requirements

### Requirement 1

**User Story:** As a user, I want the dashboard to use a modern single-column flow layout instead of the current left-right grid layout, so that content displays more spaciously and elegantly.

#### Acceptance Criteria

1. WHEN the dashboard loads THEN the system SHALL display all content sections in a single-column vertical flow layout
2. WHEN viewing any content section THEN the system SHALL utilize the full available width for better content presentation
3. WHEN the layout renders THEN the system SHALL eliminate the current grid-template-columns: 2fr 3fr constraint
4. IF the screen size changes THEN the system SHALL maintain proper responsive behavior without layout breaks

### Requirement 2

**User Story:** As a user, I want to be able to collapse and expand the browsing history section, so that I can better manage screen space and focus on relevant information.

#### Acceptance Criteria

1. WHEN viewing the browsing history section THEN the system SHALL provide a collapsible interface using HTML5 details/summary elements
2. WHEN clicking the collapse/expand control THEN the system SHALL smoothly toggle the visibility of the history content
3. WHEN the page loads THEN the system SHALL display the browsing history section in an expanded state by default
4. WHEN collapsed THEN the system SHALL show only the section header with an appropriate indicator

### Requirement 3

**User Story:** As a user, I want enhanced data visualization including timeline views, category pie charts, and keyword clouds, so that I can gain deeper insights into my browsing patterns.

#### Acceptance Criteria

1. WHEN viewing time analysis THEN the system SHALL display a 24-hour timeline chart showing browsing activity peaks and valleys
2. WHEN viewing category analysis THEN the system SHALL present category distribution as a pie chart or ring chart
3. WHEN viewing content analysis THEN the system SHALL generate a keyword cloud from high-frequency terms
4. WHEN displaying domain rankings THEN the system SHALL maintain and enhance the current ranking visualization
5. WHEN analysis data is available THEN the system SHALL use multi-column grid layout within the analysis card for better organization

### Requirement 4

**User Story:** As a developer, I want the CSS code to be modularized with reusable components, so that the codebase is more maintainable and consistent.

#### Acceptance Criteria

1. WHEN defining card styles THEN the system SHALL use a base .card class with common properties (background, border-radius, box-shadow, padding)
2. WHEN extending card styles THEN the system SHALL use modifier classes following BEM methodology (e.g., .card--analysis, .card--report)
3. WHEN defining spacing and typography THEN the system SHALL use utility classes for common properties
4. WHEN writing CSS selectors THEN the system SHALL minimize nesting depth and avoid overly specific selectors
5. WHEN styling components THEN the system SHALL eliminate duplicate code across similar elements

### Requirement 5

**User Story:** As a developer, I want the JavaScript code to be split into focused, single-responsibility modules, so that the code is easier to understand, test, and maintain.

#### Acceptance Criteria

1. WHEN organizing code THEN the system SHALL split the monolithic MimirDashboard class into separate modules: UIManager, StateService, ApiService, DataProcessor, and ReportGenerator
2. WHEN rendering UI components THEN the system SHALL use dedicated template functions instead of HTML string concatenation
3. WHEN managing application state THEN the system SHALL use a centralized state object with state-driven UI updates
4. WHEN handling DOM operations THEN the system SHALL reduce coupling between JavaScript logic and HTML element IDs
5. WHEN updating UI THEN the system SHALL trigger updates based on state changes rather than direct DOM manipulation

### Requirement 6

**User Story:** As a user, I want the dashboard to maintain all existing functionality while providing improved performance and stability, so that I can continue using all current features without disruption.

#### Acceptance Criteria

1. WHEN switching between daily and annual views THEN the system SHALL preserve all current switching functionality
2. WHEN generating AI analysis THEN the system SHALL maintain all existing AI integration capabilities
3. WHEN creating diary entries THEN the system SHALL preserve all diary generation features
4. WHEN exporting data THEN the system SHALL maintain all current export functionality
5. WHEN processing data THEN the system SHALL preserve the existing rule-based and AI-enhanced classification logic
6. WHEN loading the dashboard THEN the system SHALL provide equal or better performance compared to the current version

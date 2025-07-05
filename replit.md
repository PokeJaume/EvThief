# Analizador de EV Spreads de Smogon

## Overview

This is a web-based tool for analyzing EV (Effort Value) spreads from Smogon's Pokémon competitive data. The application allows users to upload JSON files containing Smogon chaos data and provides detailed analysis of EV distribution patterns for different Pokémon.

## System Architecture

### Frontend Architecture
- **Type**: Static Single Page Application (SPA)
- **Languages**: HTML5, CSS3, JavaScript (ES6+)
- **Rendering**: Client-side only
- **UI Framework**: Vanilla JavaScript with custom CSS styling

### Backend Architecture
- **Server**: Python HTTP server (development)
- **Type**: Static file serving only
- **No backend processing**: All data analysis happens client-side

## Key Components

### 1. File Processing Module
- **Purpose**: Handle JSON file upload and parsing
- **Location**: `script.js` - `handleFileSelect()` and `processSmogonData()`
- **Functionality**: 
  - Validates JSON format
  - Parses Smogon chaos data structure
  - Processes EV spread data

### 2. Data Analysis Engine
- **Purpose**: Analyze and categorize EV spreads
- **Location**: `script.js` - `processSmogonData()`
- **Features**:
  - Extracts unique EV combinations
  - Calculates usage statistics
  - Filters popular spreads (>5% usage)

### 3. Search and Filter System
- **Purpose**: Allow users to search and filter results
- **Location**: `script.js` - `filterResults()`, sorting functions
- **Features**:
  - Pokémon name search
  - EV spread pattern matching
  - Usage-based sorting
  - Popularity filtering

### 4. UI Components
- **File Upload Interface**: Custom styled file input with visual feedback
- **Search Interface**: Real-time filtering inputs
- **Results Display**: Dynamic content rendering
- **Statistics Summary**: Aggregate data presentation

## Data Flow

1. **File Upload**: User selects JSON file through file input
2. **File Reading**: JavaScript FileReader API processes the file
3. **Data Parsing**: JSON data is parsed and validated
4. **Data Processing**: EV spreads are extracted and analyzed
5. **Results Display**: Processed data is rendered in the UI
6. **Interactive Filtering**: Users can search and filter results in real-time

## External Dependencies

### Runtime Dependencies
- **None**: The application runs entirely in the browser without external libraries

### Development Dependencies
- **Python 3.11**: For local development server
- **Node.js 20**: Available in the environment but not currently used

### Data Dependencies
- **Smogon Chaos JSON**: User-provided data files containing competitive Pokémon statistics

## Deployment Strategy

### Current Setup
- **Development**: Python HTTP server on port 5000
- **Production**: Static file serving capability
- **Deployment**: Simple static hosting (no server-side processing required)

### Deployment Options
- **Static Hosting**: Can be deployed to any static hosting service (Netlify, Vercel, GitHub Pages)
- **CDN**: Suitable for CDN deployment for global distribution
- **Container**: Current Python server setup is containerizable

## Recent Changes

- July 5, 2025: Modernized UI with dark professional theme and improved typography
- Implemented dynamic month selection based on current date with 1-year history limit
- Added automatic availability logic (data available after day 5 of each month)
- Updated ELO selector to include correct 1760+ level instead of 1750+
- Removed real-time search, added manual filter button for better UX
- Added Pokemon set count display alongside names
- Changed from gradient backgrounds to dark theme with subtle borders and glass morphism effects

## Changelog

- June 19, 2025: Initial setup
- June 19, 2025: Integrated direct Smogon API data fetching

## User Preferences

Preferred communication style: Simple, everyday language.
# Requirements Document

## Introduction

LIKAS (Filipino for "nature" and "to evacuate") is an offline-first, AI-powered disaster companion mobile application for Filipino communities in disaster-prone areas. The Philippines experiences approximately 20 typhoons per year, 100–150 perceptible earthquakes, and multiple active volcanic events annually. When these disasters strike, cell towers fail and internet access disappears — precisely when people need life-saving information most.

LIKAS transforms a smartphone into a self-contained survival tool by pre-loading all critical data (maps, evacuation centers, disaster protocols) and running an on-device AI assistant powered by **Gemma 4** via **Google AI Edge's LiteRT** (formerly TensorFlow Lite Runtime). Every feature works fully offline, with zero dependency on network connectivity, cloud services, or external APIs at runtime.

The centerpiece of the app is the **Always-On AI Assistant** — a context-aware, conversational guide that runs entirely on-device using LiteRT inference, providing NDRRMC-aligned disaster guidance even when power grids and cell networks are down.

---

## Glossary

- **App**: The LIKAS mobile application running on Android or iOS.
- **AI_Assistant**: The on-device conversational AI component powered by Gemma 4 via LiteRT.
- **LiteRT_Runtime**: Google AI Edge's LiteRT (formerly TensorFlow Lite Runtime) inference engine embedded in the App.
- **Gemma_4_Model**: The Gemma 4 language model, quantized and bundled with the App for fully on-device inference via LiteRT_Runtime.
- **Evacuation_Module**: The App component responsible for displaying offline evacuation routes and centers.
- **Volcano_Module**: The App component providing PHIVOLCS-based volcanic emergency guidance.
- **Earthquake_Module**: The App component providing PHIVOLCS-based earthquake survival guidance.
- **Offline_Map**: Pre-loaded vector map data bundled with the App, covering disaster-prone regions of the Philippines.
- **Evacuation_Center**: A pre-loaded record containing name, coordinates, capacity, and type of a government-designated evacuation facility.
- **PAGASA**: Philippine Atmospheric, Geophysical and Astronomical Services Administration — the national weather authority.
- **PHIVOLCS**: Philippine Institute of Volcanology and Seismology — the national authority on volcanoes and earthquakes.
- **NDRRMC**: National Disaster Risk Reduction and Management Council — the national disaster management authority.
- **Alert_Level**: The official PHIVOLCS volcanic alert scale (Level 1–5) or PAGASA typhoon signal scale (Signal 1–5).
- **Fault_Line_Data**: Pre-loaded geospatial data of active fault lines sourced from PHIVOLCS.
- **Ashfall_Zone**: A pre-loaded geospatial polygon representing the projected ashfall coverage area for a given volcano.
- **Go_Bag_Checklist**: A pre-loaded, editable list of recommended emergency supplies aligned with NDRRMC guidelines.
- **Disaster_Context**: The user-selected or device-detected current disaster type (typhoon/flood, volcanic eruption, or earthquake) used to scope AI_Assistant responses.
- **User_Profile**: Locally stored data including User identity, dependents (infants, elderly, PWD), health conditions, and emergency contacts.
- **User**: A person using the App, assumed to be in or near a disaster-prone area in the Philippines.

---

## Requirements

### Requirement 1: Offline-First Architecture

**User Story:** As a User, I want the App to work completely without internet or mobile data, so that I can access life-saving information when cell towers and networks fail during a disaster.

#### Acceptance Criteria

1. THE App SHALL bundle all disaster data — including Offline_Map tiles, Evacuation_Center records, Fault_Line_Data, Ashfall_Zone polygons, PAGASA-consistent typhoon protocols, PHIVOLCS-based volcanic and earthquake protocols, and the Gemma_4_Model weights — within the application package at install time.
2. WHEN the App is launched with no active network connection, THE App SHALL present all core features — Evacuation_Module, Volcano_Module, Earthquake_Module, and AI_Assistant — as fully functional within 5 seconds of launch.
3. WHILE the device has no network connectivity, THE App SHALL perform all AI inference, map rendering, route calculation, and protocol display without making any outbound network requests.
4. IF a network connection becomes available, THEN THE App SHALL continue to operate using locally bundled data and SHALL NOT require a network connection to maintain any active session.
5. THE App SHALL display a persistent, visible indicator showing the User that the App is operating in offline mode.
6. WHEN the App is first installed, THE App SHALL complete all required data initialization — including LiteRT_Runtime setup and Gemma_4_Model loading — without requiring a network connection after the initial download.

---

### Requirement 2: Always-On AI Assistant (LiteRT + Gemma 4)

**User Story:** As a User, I want to ask disaster-related questions in natural language and receive accurate, context-aware guidance instantly, so that I can make life-saving decisions even when there is no internet connection.

#### Acceptance Criteria

1. THE AI_Assistant SHALL run all language model inference exclusively on-device using LiteRT_Runtime with the bundled Gemma_4_Model, with no data sent to any external server at any time.
2. WHEN the User submits a text query to the AI_Assistant, THE AI_Assistant SHALL produce a response within 10 seconds on a device meeting the minimum hardware specification (3 GB RAM, ARM Cortex-A55 or equivalent).
3. WHEN the User selects a Disaster_Context before querying (e.g., by tapping a "Big Button" on the dashboard), THE AI_Assistant SHALL instantly display a bold, actionable first step (e.g., "DROP, COVER, AND HOLD ON!") before continuing the chat.
4. THE AI_Assistant SHALL provide "Contextual Chips" (suggested quick-reply buttons) based on the active disaster (e.g., "I am trapped," "Someone is bleeding") to minimize typing under stress.
5. WHILE a Disaster_Context is active, THE AI_Assistant SHALL prioritize evacuation, safety, and first-aid guidance over general information in all responses.
6. WHEN the User asks about the nearest Evacuation_Center, THE AI_Assistant SHALL retrieve and present the relevant Evacuation_Center data from the pre-loaded dataset and include distance and estimated travel time based on the User's last known location.
7. IF the User's query is outside the scope of disaster preparedness or emergency response, THEN THE AI_Assistant SHALL inform the User that it is specialized for disaster guidance and redirect the User to relevant disaster topics.
8. THE AI_Assistant SHALL support queries written in both Filipino (Tagalog) and English.
9. WHEN the AI_Assistant generates a response, THE AI_Assistant SHALL clearly attribute guidance to the relevant authority (NDRRMC, PAGASA, or PHIVOLCS) where applicable.
10. WHEN the device's available RAM falls below 512 MB during an active AI_Assistant session, THE AI_Assistant SHALL display a warning to the User and SHALL gracefully degrade by providing pre-written protocol summaries in place of generative responses.

---

### Requirement 3: Go-To Evacuation Routes (Typhoon and Flood)

**User Story:** As a User in a typhoon or flood emergency, I want to see the safest route to the nearest evacuation center on an offline map, so that I can reach safety quickly without relying on internet connectivity.

#### Acceptance Criteria

1. THE Evacuation_Module SHALL display the Offline_Map with the User's current location and all Evacuation_Center markers within a 20-kilometer radius without requiring a network connection.
2. THE Evacuation_Module SHALL implement a scoring system that ranks Evacuation_Center options based on the User_Profile (e.g., prioritizing centers with PWD access if the profile includes a PWD, or pet-friendly centers if the user has pets).
3. THE Evacuation_Module SHALL add a visible badge (e.g., "⭐ Best Match") to the top-ranked recommendation for the user's specific group needs.
4. WHEN the User requests evacuation routes, THE Evacuation_Module SHALL calculate and display the top three nearest Evacuation_Center options, ranked by the scoring system and estimated travel time on foot.
5. THE Evacuation_Module SHALL clearly display a distinct marker for the "Custom Meeting Place" (Primary and Secondary) set by the User during onboarding.
6. THE Evacuation_Module SHALL render Offline_Map tiles at a zoom level sufficient to show street-level detail for navigation within 3 seconds of the User panning or zooming.
7. WHEN the User selects an Evacuation_Center from the list, THE Evacuation_Module SHALL display the center's name, address, capacity, and facility type (school, barangay hall, sports complex, etc.).
8. WHEN the User's calculated route passes through a pre-loaded flood hazard zone, THE Evacuation_Module SHALL display a visible warning on the route and SHALL suggest an alternative route that avoids the hazard zone where one exists in the pre-loaded data.

---

### Requirement 4: Volcanic Emergency Guide

**User Story:** As a User living near an active volcano, I want step-by-step guidance for before, during, and after an eruption, so that I can protect myself and my family based on official PHIVOLCS protocols.

#### Acceptance Criteria

1. THE Volcano_Module SHALL provide pre-loaded, step-by-step emergency instructions for three phases: before eruption, during eruption, and after eruption, aligned with PHIVOLCS guidelines.
2. WHEN the User selects a volcano from the pre-loaded list of active Philippine volcanoes, THE Volcano_Module SHALL display the current Alert_Level for that volcano as stored in the pre-loaded dataset and SHALL show the date the data was last updated.
3. WHEN the User views eruption guidance, THE Volcano_Module SHALL display the instructions with accompanying visual illustrations that convey the key action without relying on text alone.
4. THE Volcano_Module SHALL display the Ashfall_Zone overlay for the selected volcano on the Offline_Map, showing projected ashfall coverage areas by Alert_Level.
5. THE Volcano_Module SHALL include specific instructions for protecting respiratory health, including the correct use of N95 masks and wet cloth alternatives.
6. THE Volcano_Module SHALL include a pre-loaded list of Evacuation_Center records designated for volcanic eruption events and SHALL display these on the Offline_Map.
7. WHEN the User requests evacuation routes during a volcanic emergency, THE Volcano_Module SHALL calculate routes that avoid pre-loaded Ashfall_Zone polygons at the current Alert_Level.
8. IF the User selects an Alert_Level 4 or Alert_Level 5 scenario, THEN THE Volcano_Module SHALL display a prominent mandatory evacuation notice before showing any other guidance.

---

### Requirement 5: Earthquake Survival Plan

**User Story:** As a User in an earthquake-prone area, I want immediate survival guidance and access to fault line maps, so that I can react correctly during a tremor and understand my long-term risk.

#### Acceptance Criteria

1. THE Earthquake_Module SHALL display the "Drop, Cover, and Hold On" technique as the primary immediate-action guidance, with large, bold text and visual illustrations.
2. WHEN the User opens the Earthquake_Module, THE Earthquake_Module SHALL present the immediate survival actions within 2 seconds.
3. THE Earthquake_Module SHALL display the Fault_Line_Data overlay on the Offline_Map, showing all active fault lines in the Philippines.
4. WHEN the User taps a fault line on the Offline_Map, THE Earthquake_Module SHALL display the fault line's name, classification (active/potentially active), and last recorded significant event.
5. THE Earthquake_Module SHALL provide pre-loaded guidance for post-earthquake actions, including checking for structural damage and avoiding aftershock hazards.
6. WHEN the User's location is within 10 kilometers of a pre-loaded active fault line, THE Earthquake_Module SHALL display a visible proximity warning.
7. THE Earthquake_Module SHALL include a pre-loaded "After the Shaking Stops" checklist covering gas leak checks and structural inspection.
8. IF the User indicates they are trapped under debris, THEN THE Earthquake_Module SHALL display survival instructions for conserving energy and signaling rescuers.

---

### Requirement 6: Prep Zone (Checklist & First-Aid)

**User Story:** As a User preparing for a potential disaster, I want a pre-loaded emergency supply checklist and first-aid guide, so that I can ensure my household is ready and treat injuries even with no internet.

#### Acceptance Criteria

1. THE Prep_Zone SHALL provide survival checklists with a visual progress bar (e.g., "Go-Bag: 80% Complete") and separate categories for "Home Prep" and "Pet Needs".
2. THE Prep_Zone SHALL include a "First-Aid Library" with a searchable list of common injuries (Burns, CPR, etc.) formatted with large text, simple icons, and numbered steps.
3. WHEN the User marks an item on a checklist as packed, THE App SHALL persist that state locally across App restarts.
4. THE App SHALL allow the User to add custom items to checklists and SHALL persist those additions locally.
5. THE checklists SHALL include mandatory items for infants, elderly, and PWDs if those categories are present in the User_Profile.

---

### Requirement 7: User Onboarding and Identity

**User Story:** As a new User, I want the App to guide me through a simple setup process so it can provide advice tailored to my family's specific needs and location.

#### Acceptance Criteria

1. THE App SHALL guide the User through a 5-screen onboarding flow:
    - **Screen 1 (Identity):** Welcome message and Name/Age Group input.
    - **Screen 2 (Dependents):** Counters for Infants, Children, Elderly, and PWD/Mobility issues, plus Pet details.
    - **Screen 3 (Health):** Multi-select checklist for critical medical conditions (Asthma, Diabetes, etc.).
    - **Screen 4 (Location/Meeting Points):** Dropdown for Metro Manila City/Barangay and text/map input for Primary/Secondary meeting places.
    - **Screen 5 (Emergency Contacts):** Input for up to 3 names and phone numbers.
2. THE App SHALL allow the User to skip optional fields but SHALL warn the User that skipping location may affect route accuracy.
3. THE App SHALL allow the User to edit all onboarding data later via the "Settings & Profile" screen.

---

### Requirement 8: Emergency Dashboard and SOS

**User Story:** As a User in an active emergency, I want a hyper-intuitive screen that gives me immediate access to the most critical actions and my device status.

#### Acceptance Criteria

1. THE Dashboard SHALL display a Status Header with the User's current location (Barangay/City) and the device's current Battery Percentage.
2. THE Dashboard SHALL feature two large, distinct "Big Buttons": **EARTHQUAKE** and **TYPHOON**, which instantly launch the relevant Disaster_Context in the AI_Assistant.
3. THE Dashboard SHALL feature a persistent, red **SOS Floating Action Button**.
4. WHEN the SOS button is tapped, THE App SHALL trigger the "Emergency Contact SMS" feature, which formats a pre-written SMS with the User's location coordinates and a distress message to the saved Emergency Contacts.

---

### Requirement 9: Device and Performance Requirements

**User Story:** As a User with a low-cost Android smartphone, I want the App to run smoothly on my device, so that I can rely on it during an emergency without performance failures.

#### Acceptance Criteria

1. THE App SHALL be compatible with Android 10 (API level 29) and above and iOS 15 and above.
2. THE App SHALL operate within a maximum of 3 GB of RAM usage during active AI_Assistant sessions.
3. THE App SHALL function on devices with a minimum of 4 GB of available internal storage.
4. WHEN the device battery level falls below 15%, THE App SHALL display a low-battery warning and SHALL recommend switching to a lower-power mode (disabling generative AI).
5. THE App SHALL render all non-AI screens within 3 seconds on the minimum supported hardware.
6. WHEN the LiteRT_Runtime encounters an unrecoverable error, THE App SHALL log it locally and continue to provide access to all non-AI features.

---

### Requirement 10: Accessibility and Localization

**User Story:** As a User who may be under extreme stress, I want the App's interface to be clear, simple, and available in Filipino.

#### Acceptance Criteria

1. THE App SHALL provide Filipino (Tagalog) and English language options for all user-facing text.
2. THE App SHALL apply language changes instantly without requiring an App restart.
3. THE App SHALL use a minimum font size of 16sp for body text and 20sp for primary action labels.
4. THE App SHALL meet WCAG 2.1 AA contrast ratio requirements for all critical safety information.
5. THE App SHALL present all critical survival actions with visual icons or illustrations.
6. THE AI_Assistant voice input feature SHALL accept spoken queries in Filipino and English and transcribe them on-device.

---

### Requirement 11: Privacy and Data Security

**User Story:** As a User, I want my personal data and location to remain private and stored only on my device.

#### Acceptance Criteria

1. THE App SHALL store all User data — including User_Profile, location, and conversation history — exclusively on the local device.
2. THE App SHALL request location permission only at the point of first use and provide a clear explanation.
3. IF the User denies location permission, THE App SHALL allow manual location selection.
4. THE App SHALL NOT require User account creation or login.
5. WHEN the User uninstalls the App, THE App SHALL ensure all locally stored User data is removed.

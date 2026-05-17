# Implementation Plan: AI Rerouting Feature

This plan outlines the steps to implement a "Reroute" feature on the Map Screen, allowing users to recalculate the route to an evacuation center suggested by the AI based on their current location.

## Objective
Enhance the map's routing capabilities by providing a manual "Reroute" button that refreshes the active route using the user's latest coordinates.

## Key Files & Context
- `Likas/src/screens/MapScreen.tsx`: The main map interface where the route is displayed.
- `Likas/src/services/routingService.ts`: Provides the logic for calculating pedestrian routes.
- `Likas/src/stores/appStore.ts`: Manages the `activeRoute` state.

## Implementation Steps

### 1. Update `MapScreen.tsx` Imports and State
- Import `routingService` from `../services/routingService`.
- Add a new state variable `isRerouting` (boolean, default `false`) to track the progress of the route calculation.

### 2. Implement `handleReroute` Logic
Create a `handleReroute` callback using `useCallback`:
- Verify `userLocation` and `activeRoute` are available.
- Set `isRerouting` to `true`.
- Call `routingService.route` with:
    - `from`: `{ latitude: userLocation[1], longitude: userLocation[0] }`
    - `to`: `activeRoute.destination`
- Update the store's `activeRoute` with the new result:
    ```typescript
    setActiveRoute({
      destinationName: activeRoute.destinationName,
      destination: activeRoute.destination,
      ...newRoute,
    });
    ```
- Handle errors (e.g., `NoRouteError`, `GraphNotLoadedError`) by showing an `Alert` and resetting `isRerouting`.
- Set `isRerouting` to `false` in the `finally` block.

### 3. Update the Route Banner UI
Modify the `routeBanner` section in the `MapScreen` render method:
- Add a "Reroute" button (using `TouchableOpacity`) next to the "Clear" button.
- The button should display an `ActivityIndicator` when `isRerouting` is true.
- Style the button to match the existing banner aesthetic.

### 4. Styles
- Define styles for the reroute button and its text.

### 5. Documentation
- Create a new file `docs/reroute-feature.md` and copy the contents of this plan into it for project tracking.
- Update `docs/roadmap_maps.md` to mark the "AI Map Integration" or a sub-task as in-progress or completed.

## Verification & Testing
1. **Initial Route**: Ask the AI "Where is the nearest evacuation center?" and click "View on map".
2. **Move and Reroute**: Simulate or perform a location change, then click the "Reroute" button on the map.
3. **Verify Update**: Confirm that the route polyline updates to start from the new location and that distance/time estimates are refreshed.
4. **Error Handling**: Test rerouting when map data is missing or if no route can be found (e.g., by moving the simulated location to an isolated area).
5. **Docs Check**: Verify that `docs/reroute-feature.md` exists and `docs/roadmap_maps.md` is updated.

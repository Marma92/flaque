# Roadmap: "Everyone" Collaborator Feature for Playlists

## Overview
Implement a special "everyone" collaborator type that allows all server users to collaborate on a playlist when selected, hiding individual collaborators and displaying with a distinct visual style.

## Current State
- Playlists support specific user collaborators (stored as string array of user IDs)
- Collaborators displayed in LibraryPlaylistSection.tsx and detail views
- Backend stores collaborators in playlist metadata as `string[]`
- Permission logic in `playlistStore.ts` (`canViewPlaylist`, `canManagePlaylist`)

## Implementation Plan

### Phase 1: Backend Changes (`/backend/src/`)

#### 1. Types Update (`types/library.ts`)
```typescript
// Keep existing Playlist type but document special "everyone" value
export type Playlist = {
  // ... existing fields
  collaborators: string[]; // Can contain user IDs or "everyone"
};
```

#### 2. Storage Logic (`services/playlists/playlistStore.ts`)
Add helper functions:
```typescript
// Check if playlist has "everyone" collaborator
function hasEveryoneCollaborator(collaborators: string[]): boolean {
  return collaborators.includes("everyone");
}

// Get display collaborators (hide individuals if "everyone" present)
function getDisplayCollaborators(collaborators: string[]): string[] {
  return hasEveryoneCollaborator(collaborators) ? ["everyone"] : collaborators;
}
```

Update permission functions:
```typescript
// In canViewPlaylist - adjust if needed for public playlists with everyone collaborator
export function canViewPlaylist(playlist: Playlist, user: AuthUser): boolean {
  // Existing logic: public OR owner OR admin
  // "everyone" collaborator doesn't change view permissions for public playlists
  // Private playlists with "everyone" still require owner/admin access to view
  return playlist.visibility === "public" || playlist.authorId === user.id || user.role === "admin";
}

// Edit permissions remain unchanged - only owner/admins can manage
export function canManagePlaylist(playlist: Playlist, user: AuthUser): boolean {
  return playlist.authorId === user.id || user.role === "admin";
}
```

#### 3. API Endpoints (`api/playlistRoutes.ts`)
- Ensure endpoints accept and validate "everyone" value
- Add validation in playlist creation/update handlers

### Phase 2: Frontend Changes (`/frontend/src/`)

#### 1. Types Update (`types/library.ts`)
- No changes needed - collaborators remain `string[]`

#### 2. Collaborator UI Components

**LibraryPlaylistSection.tsx - PlaylistCard component:**
```typescript
// In PlaylistCard component, modify collaborator display:
{showBadges ? (
  <div className="mt-1.5 flex items-center gap-2">
    {/* Everyone collaborator badge */}
    {playlist.collaborators.includes("everyone") ? (
      <span className="flex items-center gap-0.5 text-[10px] text-everyone-bg/20 text-everyone">
        <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
          <!-- Use appropriate icon for "everyone" -->
          <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 2a8 8 0 110 16 8 8 0 010-16zM12 11a2 2 0 100 4 2 2 0 000-4z"/>
        </svg>
        Everyone
      </span>
    ) : (
      // Existing individual collaborators display
      playlist.collaborators.map((collab) => (
        // ... existing collaborator badge code
      ))
    )}
    {/* ... existing heart/listen badges ... */}
  </div>
) : null}
```

**Playlist Detail Views** (`PlaylistDetailView.tsx`, `ForYouPlaylistDetailView.tsx`, `AutoPlaylistDetailView.tsx`):
- Apply similar logic to collaborator display sections
- Update edit/modal components to include "Everyone" option in collaborator selectors

#### 3. Edit/Modal Components
Add "Everyone" option to collaborator dropdowns:
```typescript
// In edit modal collaborator selector
{availableCollaborators.length > 0 ? (
  <>
    <option value="">Add a collaborator...</option>
    <option value="everyone">Everyone</option>
    {availableCollaborators.map((u) => (
      <option key={u.id} value={u.id}>{u.username}</option>
    ))}
  </>
) : (
  <p className="mt-1 text-xs text-flaque-steel">
    {collaboratorIds.length > 0 ? "All users added." : "No other users available."}
  </p>
)}
```

#### 4. Styling
Add CSS classes for "everyone" collaborator badge:
```css
/* In appropriate CSS file or tailwind config */
.text-everyone {
  @apply text-yellow-600; /* or another distinctive color */
}
.bg-everyone {
  @apply bg-yellow-50;
}
```

### Phase 3: Permission Logic Refinement

#### View Permissions Analysis
- Public playlists with "everyone": Already viewable by all (public)
- Private playlists with "everyone": Still require owner/admin to view (doesn't change)
- Consider if we want to add a new visibility level or interpret "everyone" collaborator on private playlists differently

#### Edit Permissions
- Unchanged: Only owner/admins can edit/manage playlists
- "Everyone" collaborator grants collaboration (adding/removing tracks) but not management rights

## Considerations & Edge Cases

### 1. Data Migration
- Existing playlists unchanged
- New "everyone" collaborator is opt-in
- No migration needed for existing data

### 2. UI/UX Decisions
**Placement:** "Everyone" as first option in collaborator dropdown
**Visual Treatment:**
- Distinctive color (suggested: yellow/orange to differentiate from red hearts)
- Icon: User group silhouette or similar
- Label: "Everyone" (clear and unambiguous)

**States:**
- Only "everyone": Show single Everyone badge
- "everyone" + specific users: Show only Everyone badge (hide individuals)
- No "everyone": Show individual collaborator badges as today

### 3. API Consistency
- All endpoints must accept "everyone" as valid collaborator value
- Validation should reject empty strings but allow "everyone"
- Consider if "everyone" needs special handling in database (though current string array works fine)

### 4. Performance
- Minimal impact: simple array inclusion check
- No additional queries or complex computations

### 5. Security
- Verify "everyone" doesn't unintentionally change permission model
- Ensure validation prevents malicious values
- Confirm that only playlist owner can add/remove "everyone" collaborator

## Suggested Implementation Sequence

### Step 1: Backend Foundation
- [ ] Add helper functions for "everyone" detection
- [ ] Update permission logic if needed
- [ ] Test with manual playlist operations

### Step 2: API Layer
- [ ] Ensure endpoints handle "everyone" correctly
- [ ] Add validation tests

### Step 3: Frontend Display
- [ ] Update PlaylistCard to show Everyone badge
- [ ] Implement conditional display logic
- [ ] Add styling for distinctive appearance

### Step 4: Frontend Interaction
- [ ] Add "Everyone" option to collaborator selectors
- [ ] Update edit/create modal components
- [ ] Test adding/removing "everyone" collaborator

### Step 5: Detail Views
- [ ] Update PlaylistDetailView collaborator sections
- [ ] Update ForYou and Auto playlist detail views if applicable

### Step 6: Testing
- [ ] Create test playlists with "everyone" collaborator
- [ ] Verify view permissions work correctly
- [ ] Test UI shows/hides appropriate elements
- [ ] Confirm edit permissions remain restricted to owner/admin

## Open Questions for Discussion

1. **Permission Model:** Should a private playlist with "everyone" collaborator be viewable by all authenticated users?
   - Current proposal: No - maintains existing privacy model
   - Alternative: Treat as semi-public (requires login but no specific permissions)

2. **Collaborator Rights:** What specific actions does "everyone" collaborator enable?
   - Current proposal: Ability to collaborate on playlist (add/remove tracks via existing collaborator mechanisms)
   - Not: Ability to edit playlist details, change visibility, delete playlist, etc.

3. **Visual Design:** What specific styling/color/icon should represent "everyone"?
   - Needs to be distinctive but not conflict with existing badge meanings

4. **Edge Case Handling:** What happens when:
   - User tries to add "everyone" when already present?
   - User tries to remove specific users when "everyone" is present?
   - Mixing "everyone" with specific users in API requests?

## Files to Modify

### Backend:
- `backend/src/types/library.ts` (documentation)
- `backend/src/services/playlists/playlistStore.ts` (helper functions, permission logic)
- `backend/src/api/playlistRoutes.ts` (endpoint validation)

### Frontend:
- `frontend/src/types/library.ts` (no changes needed)
- `frontend/src/components/LibraryPlaylistSection.tsx` (PlaylistCard display)
- `frontend/src/components/PlaylistDetailView.tsx` (collaborator display and edit modal)
- `frontend/src/components/ForYouPlaylistDetailView.tsx` (if showing collaborators)
- `frontend/src/components/AutoPlaylistDetailView.tsx` (if showing collaborators)
- CSS/styling files for "everyone" badge appearance

---
*This roadmap provides a structured approach to implementing the "everyone" collaborator feature while maintaining backward compatibility and clear separation of concerns.*
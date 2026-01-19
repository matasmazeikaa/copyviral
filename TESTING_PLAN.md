# CopyViral - Comprehensive Release Testing Plan

## Overview
This document provides a step-by-step testing plan for the CopyViral video editing application before release. It covers all major features including authentication, payments, AI features, editing capabilities, and exports.

---

## Prerequisites Before Testing

### Environment Setup
- [ ] Ensure all environment variables are set in production:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `STRIPE_SECRET_KEY`
  - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
  - `STRIPE_WEBHOOK_SECRET`
  - `NEXT_PUBLIC_STRIPE_PRICE_MONTHLY`
  - `NEXT_PUBLIC_STRIPE_PRICE_YEARLY`
  - `GEMINI_API_KEY`
  - `NEXT_PUBLIC_APP_URL`
  
- [ ] Stripe webhook endpoint is configured and active
- [ ] Supabase database migrations are applied
- [ ] Test with both a fresh user and existing user accounts

### Test Accounts Needed
1. **Fresh Google Account** - Never used the app before
2. **Free User Account** - Has used some AI credits (not at limit)
3. **Free User at Limit** - Has used all 3 AI credits
4. **Pro User Account** - Active subscription

---

## 1. Authentication Testing

### 1.1 Login Page (`/login`)
| Test | Steps | Expected Result | Status |
|------|-------|-----------------|--------|
| Page loads correctly | Navigate to `/login` | Login page displays with Google button, feature list, branding | ☐ |
| Google OAuth flow | Click "Continue with Google" | Redirects to Google, then back to app | ☐ |
| Redirect after login | Login with `?redirect=/subscription` | After auth, redirects to `/subscription` | ☐ |
| Error display | Add `?error=test&error_description=Test%20error` to URL | Error banner displays | ☐ |
| Already logged in | Visit `/login` when authenticated | Automatically redirects to home | ☐ |

### 1.2 Sign Out
| Test | Steps | Expected Result | Status |
|------|-------|-----------------|--------|
| Sign out from sidebar | Click "Sign Out" in left sidebar | User logged out, redirected to `/login`, local data cleared | ☐ |
| Session cleared | After sign out, check IndexedDB | All projects and files cleared | ☐ |
| Cache cleared | Sign out, then sign in as different user | No data from previous user visible | ☐ |

### 1.3 Auth Callback
| Test | Steps | Expected Result | Status |
|------|-------|-----------------|--------|
| Successful callback | Complete Google OAuth | Redirected to intended page with session | ☐ |
| Callback with next param | Auth callback with `?next=/projects/123` | Redirects to specified next URL | ☐ |

---

## 2. Projects Page (Home `/`)

### 2.1 Project List
| Test | Steps | Expected Result | Status |
|------|-------|-----------------|--------|
| Empty state | Login as new user with no projects | "No projects yet" message displays | ☐ |
| Loading state | Refresh page | Loading spinner shows while fetching | ☐ |
| Projects display | Login with existing projects | All projects shown in grid, sorted by last modified | ☐ |
| Project card info | View project card | Shows name, duration (if any), last modified date | ☐ |
| Click to open | Click on a project card | Navigates to `/projects/{id}` | ☐ |

### 2.2 Create Project
| Test | Steps | Expected Result | Status |
|------|-------|-----------------|--------|
| Open create modal | Click "Create Blank Project" | Modal opens with name input | ☐ |
| Cancel creation | Click Cancel or press Escape | Modal closes, no project created | ☐ |
| Create with name | Enter name and click "Create Project" | Project created, success toast, appears in list | ☐ |
| Empty name validation | Try to create with empty name | Create button disabled | ☐ |
| Keyboard submit | Type name and press Enter | Project created | ☐ |

### 2.3 Delete Project
| Test | Steps | Expected Result | Status |
|------|-------|-----------------|--------|
| Delete button visible | Hover over project card (desktop) | Delete icon appears | ☐ |
| Delete confirmation | Click delete icon | Project deleted, success toast | ☐ |
| Delete spinner | Click delete | Loading spinner shows during deletion | ☐ |
| Deleted from list | After delete | Project removed from UI immediately | ☐ |

### 2.4 Edit Project Name
| Test | Steps | Expected Result | Status |
|------|-------|-----------------|--------|
| Edit button visible | Hover over project card | Pencil icon appears | ☐ |
| Enter edit mode | Click pencil icon | Input field appears with current name | ☐ |
| Save with Enter | Type new name, press Enter | Name updated, toast shows | ☐ |
| Save with button | Click checkmark button | Name updated | ☐ |
| Cancel edit | Click X button or press Escape | Edit cancelled, name unchanged | ☐ |
| Click doesn't navigate | Click in edit mode | Doesn't navigate to project | ☐ |

### 2.5 AI Quick Start
| Test | Steps | Expected Result | Status |
|------|-------|-----------------|--------|
| Button visible | View home page | "Quick Start with AI" button visible | ☐ |
| Opens modal | Click AI Quick Start | AI Tools Modal opens | ☐ |

---

## 3. Subscription & Payments

### 3.1 Subscription Page (`/subscription`)
| Test | Steps | Expected Result | Status |
|------|-------|-----------------|--------|
| Page loads (free user) | Navigate as free user | Shows usage (e.g., "1/3"), Free plan selected | ☐ |
| Page loads (pro user) | Navigate as pro user | Shows "Unlimited", Pro badge, subscription details | ☐ |
| Unauthenticated | Visit without login | Redirects to `/login?redirect=/subscription` | ☐ |
| Loading state | Refresh page | Loading spinner while fetching data | ☐ |

### 3.2 Usage Display
| Test | Steps | Expected Result | Status |
|------|-------|-----------------|--------|
| Free user usage bar | View as free user | Progress bar shows X/3 usage | ☐ |
| At limit display | View as user at limit | Red progress bar, upgrade prompt | ☐ |
| Pro user unlimited | View as pro user | Shows "Unlimited" with full gold bar | ☐ |

### 3.3 Billing Toggle
| Test | Steps | Expected Result | Status |
|------|-------|-----------------|--------|
| Default monthly | Load page | Monthly selected by default | ☐ |
| Switch to yearly | Click "Yearly" | Yearly selected, shows 17% savings | ☐ |
| Price updates | Toggle billing cycle | Price per month updates accordingly | ☐ |

### 3.4 Checkout Flow (USE STRIPE TEST MODE!)
| Test | Steps | Expected Result | Status |
|------|-------|-----------------|--------|
| Monthly checkout | Click "Upgrade to Pro" (monthly) | Redirects to Stripe checkout with monthly price | ☐ |
| Yearly checkout | Select yearly, click upgrade | Redirects to Stripe with yearly price | ☐ |
| Checkout success | Complete Stripe test payment | Returns to `/subscription?success=true`, success toast, status updates | ☐ |
| Checkout cancel | Click back/cancel in Stripe | Returns to `/subscription?canceled=true`, cancel toast | ☐ |
| Customer created | First checkout for user | Stripe customer ID saved to user profile | ☐ |

### 3.5 Subscription Management (Pro Users)
| Test | Steps | Expected Result | Status |
|------|-------|-----------------|--------|
| Manage button | View page as Pro user | "Manage Subscription" button visible | ☐ |
| Open portal | Click "Manage Billing & Cancel" | Redirects to Stripe Customer Portal | ☐ |
| Status display | View subscription details | Shows "Active" status and next billing date | ☐ |

### 3.6 Webhook Testing (Critical!)
| Test | Steps | Expected Result | Status |
|------|-------|-----------------|--------|
| Webhook endpoint reachable | GET `/api/stripe/webhook` | Returns status JSON | ☐ |
| checkout.session.completed | Complete test purchase | User profile updated with subscription status | ☐ |
| customer.subscription.updated | Update subscription in Stripe | User profile reflects changes | ☐ |
| customer.subscription.deleted | Cancel subscription in Stripe | User status changes to "canceled" | ☐ |
| invoice.payment_succeeded | Successful renewal | AI generations reset to 0 | ☐ |
| invoice.payment_failed | Simulate failed payment | Status changes to "past_due" | ☐ |

---

## 4. AI Features

### 4.1 AI Tools Modal
| Test | Steps | Expected Result | Status |
|------|-------|-----------------|--------|
| Open from home | Click AI Quick Start on home | Modal opens | ☐ |
| Open from editor | Click AI Tools in left sidebar | Modal opens with current project context | ☐ |
| Video Reference selected | Default state | Video Reference tool selected | ☐ |
| Audio Beats disabled | Click Audio Beats | "Coming Soon" toast appears | ☐ |
| Close modal | Click X or Cancel | Modal closes | ☐ |

### 4.2 URL Input & Validation
| Test | Steps | Expected Result | Status |
|------|-------|-----------------|--------|
| Empty URL | Click "Analyze Video" with empty input | "Please enter a URL" error | ☐ |
| Invalid URL | Enter "randomtext" | "Please enter a valid Instagram URL" error | ☐ |
| Valid Instagram URL | Enter valid Instagram Reel URL | Proceeds to processing | ☐ |
| Instagram URL formats | Test `instagram.com`, `instagr.am`, with/without `www` | All accepted | ☐ |

### 4.3 AI Usage Limits (Free Users)
| Test | Steps | Expected Result | Status |
|------|-------|-----------------|--------|
| Check credits display | View left sidebar | Shows "X/3 AI Credits" with progress bar | ☐ |
| Use AI at limit | Try AI when at 3/3 | Upgrade modal appears | ☐ |
| Upgrade prompt | View when at limit | "Unlock More AI Credits" button shown | ☐ |
| Credit incremented | Complete AI analysis | Usage count increases by 1 | ☐ |

### 4.4 AI Video Analysis Flow
| Test | Steps | Expected Result | Status |
|------|-------|-----------------|--------|
| Submit valid URL | Enter Instagram URL, click Analyze | Loading modal appears | ☐ |
| Downloading stage | Watch loading modal | Shows "Downloading video" with icon | ☐ |
| Analyzing stage | Watch progress | Shows "AI analyzing cuts & timing" | ☐ |
| Processing stage | Watch progress | Shows "Processing results" | ☐ |
| Success result | Complete analysis | Placeholders created, audio extracted, success toast | ☐ |
| Text layers created | Analysis with text | Text elements appear in timeline | ☐ |
| Error handling | Use invalid/private video URL | Error toast displayed, modal closes | ☐ |
| Overloaded error | When Gemini is overloaded | Specific "model overloaded" error message | ☐ |

### 4.5 Override Warning (Existing Project)
| Test | Steps | Expected Result | Status |
|------|-------|-----------------|--------|
| Project has data | Open AI modal for project with media | "Has existing data" badge shown | ☐ |
| Warning displayed | Submit URL for project with data | Warning modal appears | ☐ |
| Cancel override | Click Cancel in warning | Stays in AI modal, nothing changed | ☐ |
| Confirm override | Click "Override & Continue" | Proceeds with analysis, replaces content | ☐ |

### 4.6 Auto-Analyze (URL Parameter)
| Test | Steps | Expected Result | Status |
|------|-------|-----------------|--------|
| Auto-analyze triggers | Navigate to `/projects/{id}?autoAnalyze={url}` | AI analysis starts automatically | ☐ |
| URL cleared after success | Complete analysis | URL parameter removed from address bar | ☐ |
| Only triggers once | Triggered once | Doesn't re-trigger on component remount | ☐ |

---

## 5. Video Editor

### 5.1 Project Loading
| Test | Steps | Expected Result | Status |
|------|-------|-----------------|--------|
| Valid project loads | Navigate to existing project | Editor loads with project data | ☐ |
| Invalid project | Navigate to non-existent ID | Redirects to 404 | ☐ |
| Loading state | Navigate to project | Loading spinner shows | ☐ |
| Cloud project loads | Load project from Supabase | Media downloaded and displayed | ☐ |
| Download progress | Load project with cloud media | Progress bar shows download progress | ☐ |

### 5.2 Left Sidebar
| Test | Steps | Expected Result | Status |
|------|-------|-----------------|--------|
| Back to projects | Click arrow or logo | Navigates to home page | ☐ |
| Pro badge | View as Pro user | PRO badge visible | ☐ |
| AI credits display | View sidebar | Shows AI credit usage | ☐ |
| Library button | Click Library | Media library modal opens | ☐ |
| Add Text button | Click Add Text | Text element added to timeline | ☐ |

### 5.3 Media Upload (Quick Upload)
| Test | Steps | Expected Result | Status |
|------|-------|-----------------|--------|
| Upload video | Select video file | Video added to timeline, progress shown | ☐ |
| Upload image | Select image file | Image added to timeline | ☐ |
| Upload multiple | Select multiple files | All added, proper toasts shown | ☐ |
| Replace placeholder | Upload when placeholders exist | Placeholder replaced, toast confirms | ☐ |
| Audio rejected | Try to upload audio via media upload | Error: "Audio files should be uploaded using Audio Track section" | ☐ |
| Large file progress | Upload large video | Progress bar updates in real-time | ☐ |

### 5.4 Audio Track
| Test | Steps | Expected Result | Status |
|------|-------|-----------------|--------|
| Empty state | No audio | "Open Audio Library" button shown | ☐ |
| Upload audio | Upload audio file | Audio track appears, waveform shown in timeline | ☐ |
| Audio from library | Add from audio library | Audio added, success toast | ☐ |
| Replace audio | Upload new audio when one exists | Replaces existing audio | ☐ |
| Remove audio | Click trash icon | Audio removed, success toast | ☐ |

### 5.5 Preview Player
| Test | Steps | Expected Result | Status |
|------|-------|-----------------|--------|
| Play/pause | Click play button | Video plays/pauses | ☐ |
| Timeline scrubbing | Drag timeline marker | Preview updates to position | ☐ |
| Mute toggle | Click mute button | Audio mutes/unmutes | ☐ |
| Video renders in preview | Add video to timeline | Video visible in preview canvas | ☐ |
| Text renders | Add text element | Text visible at correct position | ☐ |
| Image renders | Add image | Image visible in preview | ☐ |

### 5.6 Timeline
| Test | Steps | Expected Result | Status |
|------|-------|-----------------|--------|
| Zoom in/out | Use zoom controls | Timeline scale changes | ☐ |
| Select clip | Click on clip in timeline | Clip selected, properties shown | ☐ |
| Move clip | Drag clip | Clip position changes | ☐ |
| Resize clip | Drag clip edges | Clip duration changes | ☐ |
| Delete clip | Select and press Delete | Clip removed | ☐ |
| Multiple tracks | Add videos and images | Separate tracks shown | ☐ |
| Audio waveform | Add audio | Waveform displayed in audio track | ☐ |
| Text timeline | Add text | Text element shown in text track | ☐ |
| Placeholder display | AI creates placeholders | Placeholders visually distinct | ☐ |

### 5.7 Text Elements
| Test | Steps | Expected Result | Status |
|------|-------|-----------------|--------|
| Add text | Click "Add Text" | Text added with default style | ☐ |
| Edit text content | Double-click text in preview | Text becomes editable | ☐ |
| Move text | Drag text in preview | Position updates | ☐ |
| Text properties | Select text | Properties panel shows styling options | ☐ |
| Change font | Select different font | Font changes in preview | ☐ |
| Change color | Pick new color | Color updates in preview | ☐ |
| Change size | Adjust font size | Size updates | ☐ |
| Multi-line text | Enter text with line breaks | Renders as multiple lines | ☐ |

### 5.8 Media Properties
| Test | Steps | Expected Result | Status |
|------|-------|-----------------|--------|
| Properties panel | Select media clip | Properties shown in right sidebar | ☐ |
| Adjust volume | Move volume slider | Volume changes | ☐ |
| Adjust opacity | Move opacity slider | Opacity changes in preview | ☐ |
| Aspect ratio modes | Select cover/fit/original | Video display mode changes | ☐ |
| Position/transform | Use transform controls | Media position updates | ☐ |

---

## 6. Media Library

### 6.1 Library Modal
| Test | Steps | Expected Result | Status |
|------|-------|-----------------|--------|
| Open library | Click Library button | Modal opens | ☐ |
| Loading state | Open modal | Loading spinner while fetching | ☐ |
| Empty state | New user with no files | "No media files yet" message | ☐ |
| Files displayed | User with files | Grid of files shown | ☐ |
| Close modal | Click X or Cancel | Modal closes | ☐ |

### 6.2 Storage Display
| Test | Steps | Expected Result | Status |
|------|-------|-----------------|--------|
| Free user limit | View as free user | Shows usage / 5GB limit | ☐ |
| Pro user limit | View as Pro user | Shows usage / 100GB limit, Pro badge | ☐ |
| Usage bar color | View at different usage levels | Green < 70%, Yellow 70-90%, Red > 90% | ☐ |

### 6.3 Upload Files
| Test | Steps | Expected Result | Status |
|------|-------|-----------------|--------|
| Upload button | Click Upload | File picker opens | ☐ |
| Upload progress | Upload file | Progress bar shows in modal | ☐ |
| Upload success | Complete upload | Checkmark shown, file in list | ☐ |
| Upload error | Exceed storage limit | Error shown, appropriate message | ☐ |
| Multiple uploads | Select multiple files | All upload simultaneously | ☐ |
| Storage validation | Try upload when near limit | Server validates and rejects if over | ☐ |

### 6.4 Select & Add
| Test | Steps | Expected Result | Status |
|------|-------|-----------------|--------|
| Select file | Click on file | Selection indicator appears | ☐ |
| Multi-select | Click multiple files | Multiple selected | ☐ |
| Deselect | Click selected file | Deselected | ☐ |
| Add to timeline | Select files, click "Add to Timeline" | Files added, modal closes | ☐ |
| Selection count | Select files | "X items selected" shown | ☐ |

### 6.5 Delete Files
| Test | Steps | Expected Result | Status |
|------|-------|-----------------|--------|
| Delete single | Click trash on file | File deleted, toast shown | ☐ |
| Delete selected | Select files, click Delete | All selected deleted | ☐ |
| Storage updates | Delete files | Storage usage refreshes | ☐ |

### 6.6 Audio Library
| Test | Steps | Expected Result | Status |
|------|-------|-----------------|--------|
| Open audio library | Click library in audio section | Audio-filtered library opens | ☐ |
| Only audio shown | View library | Only audio files displayed | ☐ |
| Add to project | Select and add | Audio added as track | ☐ |

---

## 7. Export/Render

### 7.1 FFmpeg Loading
| Test | Steps | Expected Result | Status |
|------|-------|-----------------|--------|
| Initial load | Open project with media | "Loading FFmpeg..." shown | ☐ |
| FFmpeg ready | Wait for load | "Render" button becomes enabled | ☐ |

### 7.2 Render Settings
| Test | Steps | Expected Result | Status |
|------|-------|-----------------|--------|
| View settings | Open export section | Settings options visible | ☐ |
| Change quality | Adjust quality setting | Setting saved to project | ☐ |
| Change speed | Adjust speed preset | Setting updated | ☐ |

### 7.3 Render Disabled States
| Test | Steps | Expected Result | Status |
|------|-------|-----------------|--------|
| No media | Empty project | Render button disabled | ☐ |
| Has placeholders | Project with unfilled placeholders | Render button disabled | ☐ |
| FFmpeg loading | Before FFmpeg loads | Button shows "Loading FFmpeg..." | ☐ |

### 7.4 Render Process
| Test | Steps | Expected Result | Status |
|------|-------|-----------------|--------|
| Start render | Click Render | Modal opens, rendering starts | ☐ |
| Progress messages | Watch during render | Animated messages rotate | ☐ |
| Progress bar | Watch render | Progress bar updates | ☐ |
| Render success | Complete render | Preview video shown, download button | ☐ |
| Download video | Click Download | Video file downloads with project name | ☐ |
| Close modal | Click X during render | FFmpeg reloads, modal closes | ☐ |

### 7.5 Render Error Handling
| Test | Steps | Expected Result | Status |
|------|-------|-----------------|--------|
| Render fails | Cause render error | Error UI shown with "Refresh Page" button | ☐ |
| Refresh recovery | Click Refresh Page | Page reloads, FFmpeg reloads | ☐ |

### 7.6 Render Content Accuracy
| Test | Steps | Expected Result | Status |
|------|-------|-----------------|--------|
| Video renders | Export project with video | Video appears correctly | ☐ |
| Audio included | Export with audio | Audio plays in export | ☐ |
| Text renders | Export with text | Text at correct position and timing | ☐ |
| Timing accurate | Check clip timings | Clips start/end at correct times | ☐ |
| Opacity applied | Video with opacity | Opacity correct in export | ☐ |
| Volume applied | Audio with volume changes | Volume levels correct | ☐ |

---

## 8. Mobile Responsiveness

### 8.1 Home Page Mobile
| Test | Steps | Expected Result | Status |
|------|-------|-----------------|--------|
| Layout adapts | View on mobile | Grid becomes single column | ☐ |
| Touch interactions | Tap project card | Opens project | ☐ |
| Create project modal | Open on mobile | Modal slides up from bottom | ☐ |

### 8.2 Editor Mobile
| Test | Steps | Expected Result | Status |
|------|-------|-----------------|--------|
| Sidebars hidden | View editor on mobile | Sidebars hidden, nav bar shown | ☐ |
| Left drawer | Tap hamburger menu | Left sidebar slides in | ☐ |
| Right drawer | Tap settings icon | Right sidebar slides in | ☐ |
| Close drawer | Tap outside drawer | Drawer closes | ☐ |
| Timeline collapse | Tap timeline toggle | Timeline expands/collapses | ☐ |
| Preview fits | View preview | Preview scales to fit viewport | ☐ |

### 8.3 Subscription Mobile
| Test | Steps | Expected Result | Status |
|------|-------|-----------------|--------|
| Cards stack | View subscription page | Pricing cards stack vertically | ☐ |
| Toggle works | Tap monthly/yearly | Pricing updates | ☐ |

---

## 9. Error Handling & Edge Cases

### 9.1 Network Errors
| Test | Steps | Expected Result | Status |
|------|-------|-----------------|--------|
| Offline mode | Disable network | Appropriate error messages | ☐ |
| API timeout | Slow connection | Loading states handle timeout | ☐ |
| Failed file upload | Interrupt upload | Error state shown, can retry | ☐ |

### 9.2 Data Edge Cases
| Test | Steps | Expected Result | Status |
|------|-------|-----------------|--------|
| Very long project name | Create project with 100+ chars | Truncates in UI properly | ☐ |
| Special characters | Use emojis/symbols in names | Handles correctly | ☐ |
| Large file | Upload 1GB+ video | Handles with progress | ☐ |
| Many clips | Add 20+ clips to timeline | Performance acceptable | ☐ |
| Long duration | Project > 5 minutes | Timeline scales, export works | ☐ |

### 9.3 Session Edge Cases
| Test | Steps | Expected Result | Status |
|------|-------|-----------------|--------|
| Session expires | Let session expire | Prompts re-login | ☐ |
| Multiple tabs | Open app in multiple tabs | Works without conflicts | ☐ |
| Different users | Switch Google accounts | Data properly separated | ☐ |

---

## 10. Cross-Browser Testing

| Browser | Home | Editor | Export | Payments | Status |
|---------|------|--------|--------|----------|--------|
| Chrome (latest) | ☐ | ☐ | ☐ | ☐ | |
| Firefox (latest) | ☐ | ☐ | ☐ | ☐ | |
| Safari (latest) | ☐ | ☐ | ☐ | ☐ | |
| Edge (latest) | ☐ | ☐ | ☐ | ☐ | |
| Chrome Mobile | ☐ | ☐ | ☐ | ☐ | |
| Safari iOS | ☐ | ☐ | ☐ | ☐ | |

---

## 11. Performance Testing

| Test | Target | Status |
|------|--------|--------|
| Home page load | < 2s | ☐ |
| Editor initial load | < 3s | ☐ |
| FFmpeg load time | < 5s | ☐ |
| Preview playback | 30fps smooth | ☐ |
| Timeline interactions | No jank | ☐ |
| Library modal open | < 1s | ☐ |

---

## 12. Security Checklist

| Test | Steps | Expected Result | Status |
|------|-------|-----------------|--------|
| Protected routes | Access `/projects/xxx` without login | Redirects to login | ☐ |
| API auth | Call APIs without auth token | 401 Unauthorized | ☐ |
| User data isolation | Try to access other user's project | 404 or access denied | ☐ |
| Stripe webhooks | Send fake webhook | Invalid signature rejected | ☐ |
| File access | Try to access other user's files | Access denied | ☐ |

---

## Quick Smoke Test Checklist

For rapid verification, run through these critical paths:

1. ☐ **Login** → Sign in with Google → Lands on home page
2. ☐ **Create Project** → Create new blank project → Opens in editor
3. ☐ **Upload Media** → Upload a video → Appears in timeline
4. ☐ **Add Text** → Add text element → Visible in preview
5. ☐ **Export** → Render video → Download works
6. ☐ **AI Feature** → Paste Instagram URL → Creates placeholders
7. ☐ **Subscription** → View subscription page → Checkout redirects to Stripe
8. ☐ **Library** → Open library → Upload and add to timeline works
9. ☐ **Mobile** → Test on phone → Sidebars work, can navigate
10. ☐ **Sign Out** → Sign out → Redirected, data cleared

---

## Test Execution Log

| Date | Tester | Section Tested | Issues Found | Status |
|------|--------|----------------|--------------|--------|
| | | | | |
| | | | | |
| | | | | |

---

## Notes & Known Issues

_Document any known issues or special testing notes here:_

1. 
2. 
3. 

---

## Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| QA Lead | | | |
| Developer | | | |
| Product Owner | | | |

# CIVIQ

## 🌐 Live Demo

**Web App:** (https://civiq-c7b22.web.app/login)



<img width="1919" height="1013" alt="Screenshot 2026-06-30 232200" src="https://github.com/user-attachments/assets/e5cf8461-5802-4142-adf1-84d0d6274f90" />
<img width="1917" height="1008" alt="Screenshot 2026-06-30 232223" src="https://github.com/user-attachments/assets/51b79364-6404-458c-be08-bb667b46a5b5" />
<img width="1919" height="923" alt="Screenshot 2026-06-30 232330" src="https://github.com/user-attachments/assets/d7f256ec-d568-4ec2-a728-2797a161e265" />
<img width="1909" height="1019" alt="Screenshot 2026-06-30 232342" src="https://github.com/user-attachments/assets/e601a488-d682-4836-810f-f22f1fd256a1" />
<img width="1919" height="1072" alt="Screenshot 2026-06-30 232419" src="https://github.com/user-attachments/assets/829f48b6-d5c2-4e92-af84-77e1a4312b4c" />
<img width="1919" height="1073" alt="Screenshot 2026-06-30 232527" src="https://github.com/user-attachments/assets/170dc904-a1e9-4f15-9b35-d22dc1a5da5a" />
<img width="1836" height="974" alt="Screenshot 2026-06-30 232756" src="https://github.com/user-attachments/assets/b0d5b92d-049d-4046-88cf-e0f24383253c" />
<img width="1919" height="806" alt="Screenshot 2026-07-01 002455" src="https://github.com/user-attachments/assets/ba2a07fa-7af8-43ad-bc2c-438ad7c3984e" />
<img width="1919" height="830" alt="Screenshot 2026-07-01 002512" src="https://github.com/user-attachments/assets/bf904a29-50cb-462e-b655-c67da63fd5a1" />
<img width="1918" height="808" alt="Screenshot 2026-07-01 002433" src="https://github.com/user-attachments/assets/5049fea2-19de-4495-86a8-83498d4886af" />
<img width="1919" height="807" alt="Screenshot 2026-07-01 002443" src="https://github.com/user-attachments/assets/d3f70cc5-2cdb-4111-81d3-71b477b3f083" />


# CIVIQ - Community Hero: Hyperlocal Problem Solver

CIVIQ is an AI-powered civic issue reporting platform that enables citizens to report public infrastructure problems such as potholes, waste accumulation, damaged streetlights, water leakages, and road hazards. The platform simplifies reporting, improves transparency, and encourages community participation through a modern mobile experience.

---

## Problem Statement

**Community Hero – Hyperlocal Problem Solver**

Communities often struggle with fragmented reporting systems for civic issues. Reports are difficult to track, lack transparency, and rarely provide meaningful updates to citizens. CIVIQ addresses this by creating a centralized platform for reporting, tracking, and prioritizing community issues.

---

## Solution Overview

CIVIQ provides a mobile-first platform where users can:

- Report civic issues with images and location
- View recent community reports
- Track issue status
- Discover nearby reported problems
- Enable AI-assisted categorization and prioritization of reports
- Promote community participation through a transparent reporting workflow

---

## Key Features

- User Authentication
- AI-assisted Issue Categorization
- Image Upload with Secure Storage
- GPS Location Capture
- Community Issue Feed
- Interactive Map View
- Search and Category Filtering
- Real-time Updates
- Duplicate Report Detection
- Issue Severity Classification
- Ward-based Issue Assignment (AI-assisted)
- Civic Dashboard
- Mobile-first User Experience

---

## Tech Stack

### Frontend

- React Native (Expo)
- TypeScript
- Expo Router
- NativeWind
- React Native Maps

### Backend

- Supabase
- PostgreSQL
- PostGIS
- Supabase Storage
- Supabase Edge Functions
- Realtime Database

### AI

- Google Gemini API
- Google AI Studio
- Vector Embeddings
- AI-based Issue Analysis

---

## Google Technologies Utilized

- Google AI Studio
- Gemini API
- Gemini 2.0 Flash
- Text Embedding Model
- Google Maps compatible location data

---

## Project Workflow

1. User logs in.
2. User reports an issue with image and description.
3. Image is securely uploaded.
4. AI analyzes the report.
5. Category and severity are generated.
6. Issue appears in the community feed.
7. Citizens can monitor reported issues.

---

## What Makes CIVIQ Different

- AI analyzes reports instead of relying solely on manual categorization.
- Hyperlocal issue discovery encourages neighborhood participation.
- Duplicate detection helps reduce repeated reports.
- Built with a scalable backend architecture.
- Designed to support future civic authority integration.
- Mobile-first experience focused on real-world usability.
- AI-assisted prioritization enables faster identification of high-impact issues.

---

## Current Status

### Fully Working

- Authentication
- Report Submission
- Secure Image Upload
- Community Feed
- Dashboard
- Search & Filtering
- Interactive Map
- Real-time Updates
- Issue Tracking
- Responsive Mobile UI

---

## Future Enhancements

- Municipal/Admin Dashboard
- Authority Login Portal
- Automated Authority Notifications
- AI-generated Resolution Suggestions
- Push Notifications
- Public Comment System
- Reputation & Reward System
- Analytics Dashboard
- Offline Report Submission
- Multi-language Support
- Heatmap Visualization
- Smart Duplicate Detection Improvements
- Advanced Ward Intelligence

---

## Challenges Faced

- Adapting a React Native (Expo) application to meet hackathon deployment requirements, which required creating and hosting a web-compatible version using Firebase Hosting before finalizing the production workflow.
- Integrating Supabase Authentication, PostgreSQL, PostGIS, Realtime, Storage, and Edge Functions into a unified backend.
- Migrating from Cloudflare R2 to native Supabase Storage for a simpler and more reliable image upload pipeline.
- Implementing secure Row Level Security (RLS) policies while maintaining seamless user access.
- Building an automated AI pipeline using PostgreSQL triggers and Supabase Edge Functions.
- Handling Android-specific file upload compatibility with Expo SDK 56.
- Integrating Google Gemini AI for issue analysis while gracefully handling external API quota limitations.
- Resolving backend triggers, storage policies, and TypeScript issues to achieve a stable production-ready build.straints.

## What Makes CIVIQ Different

- AI-assisted classification automatically categorizes and prioritizes reported issues.
- Hyperlocal reporting encourages citizens to solve problems within their own communities.
- Real-time synchronization keeps reports updated across all users.
- Secure backend built using Supabase with Row Level Security and Edge Functions.
- Designed with a scalable architecture that can integrate directly with municipal authorities in future releases.
- Duplicate detection reduces redundant reports and improves data quality.
- Modular architecture allows future integration with government portals, notifications, and analytics without redesigning the platform.

---

## Impact

CIVIQ empowers citizens to actively participate in improving their communities while providing a transparent and scalable platform for reporting, monitoring, and eventually resolving civic infrastructure issues.

---

## Future Vision

CIVIQ aims to evolve into a complete civic engagement ecosystem connecting citizens, local authorities, and AI-powered decision support. Future versions will focus on automated issue routing, predictive infrastructure analytics, authority dashboards, and data-driven urban planning.

---

## Team

Developed for the **Google AI Hackathon** under the problem statement:

**Community Hero – Hyperlocal Problem Solver**

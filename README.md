# SaaS Platform

Universal SaaS platform for organizations, schedule planning, participants, events, points-based accounting, notifications and chats.

## Roadmap

1. Foundation: monorepo setup, core backend bootstrap, base Prisma domain schema.
2. Authentication: email/password, JWT access/refresh, OAuth (Google/VK/Yandex).
3. Organizations and memberships: CRUD, roles, invitations, access control.
4. Participants: internal/external participants, invite flow, account linking.
5. Events and templates: CRUD, fixed casts, role assignments, workload model.
6. Smart scheduling: conflict detection, overlap hints, drag and drop calendar flows.
7. Points and finance: auto-calculation rules, manual adjustments with audit, reports.
8. Notifications and chat: web/push/VK delivery, org chat and event chat.
9. Analytics and ops: participant load analytics, event statistics, observability hardening.

## Quick start

1. `npm install`
2. `cp .env.example .env`
3. `npm run db:up`
4. `npm run prisma:generate`
5. `npm run prisma:migrate`
6. `npm run dev`

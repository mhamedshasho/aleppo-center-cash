# Code Documentation — توثيق وشرح الأكواد

> Aleppo Center Cash
>
> هذا الملف يشرح بنية الكود ووظيفة الملفات المهمة **بالعربي والإنكليزي**.
> It is a practical bilingual guide to the project's source code and how the parts work together.

## 1. نظرة سريعة — Quick overview

**العربي:**  
المشروع عبارة عن تطبيق محاسبة سحابي مبني بـ React + TypeScript. الواجهة تعمل في المتصفح، وSupabase هو مصدر البيانات السحابي، بينما Vercel يستضيف التطبيق. PostgreSQL هو مصدر الحقيقة للبيانات المحاسبية عند الاتصال بالسحابة.

**English:**  
The project is a cloud accounting application built with React and TypeScript. The UI runs in the browser, Supabase provides the cloud data/authentication layer, and Vercel hosts the application. PostgreSQL is the authoritative accounting data source when connected.

~~~text
Browser
  │
  ├── React UI
  ├── Pages
  ├── Components
  ├── Auth / Validation
  └── Supabase Sync
          │
          ▼
      Supabase
       ├── Auth
       ├── PostgreSQL
       ├── RLS
       ├── Realtime
       └── Edge Functions
                │
                ▼
        Private Backups
~~~

---

# 2. مجلدات المشروع — Project folders

| Folder | عربي | English |
|---|---|---|
| client/ | تطبيق الواجهة | Frontend application |
| client/src/pages/ | صفحات التطبيق الرئيسية | Main application pages |
| client/src/components/ | مكونات الواجهة المشتركة | Shared UI components |
| client/src/components/ui/ | مكونات UI جاهزة/أساسية | Reusable UI primitives |
| client/src/lib/ | المنطق والخدمات المساعدة | Application services/helpers |
| client/src/hooks/ | React hooks مخصصة | Custom React hooks |
| client/src/contexts/ | حالات عامة مثل الثيم | Global React contexts |
| supabase/migrations/ | تغييرات قاعدة البيانات | Database migrations |
| supabase/functions/ | كود يعمل على Supabase | Supabase Edge Functions |
| server/ | خادم Express للتقديم | Express serving server |
| shared/ | كود مشترك بين أجزاء التطبيق | Shared code |
| docs/ | التوثيق | Documentation |
| .github/ | أتمتة وفحوصات GitHub | GitHub automation/CI |

---

# 3. تشغيل التطبيق — Application startup

## client/src/main.tsx

**العربي:**  
هذه نقطة بداية React. تنشئ React root داخل عنصر root وتشغّل App. يوجد أيضًا تنظيف لتسجيلات Service Worker والكاش القديم حتى لا يبقى إصدار قديم من التطبيق عالقًا في المتصفح.

**English:**  
This is the React entry point. It creates the React root inside root and renders App. It also removes old Service Worker registrations and browser caches to prevent stale application versions.

**التدفق — Flow:**

main.tsx → App.tsx → Router → Page

---

# 4. التطبيق الرئيسي — Main application

## client/src/App.tsx

**العربي:**  
هذا الملف يجمع الطبقات الرئيسية للتطبيق:

- Error Boundary لمنع انهيار الواجهة بالكامل.
- Theme Provider للوضع الفاتح/الداكن.
- Tooltip Provider.
- Toaster للإشعارات.
- Wouter للتنقل بين المسارات.
- CloudAuthGate لحماية التطبيق وبدء جلسة المستخدم.
- يحدد أيضًا هل الجهاز هاتف أم كمبيوتر اعتمادًا على عرض الشاشة.

**English:**  
This file composes the application's main layers:

- Error Boundary for runtime failures.
- Theme Provider for light/dark mode.
- Tooltip Provider.
- Toaster for notifications.
- Wouter for routing.
- CloudAuthGate for authentication/workspace access.
- Device classification for phone vs PC responsive behavior.

### Routes

| Route | الوظيفة | Purpose |
|---|---|---|
| / | بوابة الدخول | Authentication gate |
| /credits | معلومات فريق التطوير | Development credits |
| /:workspaceSlug | مساحة عمل | Workspace |
| /404 | صفحة غير موجودة | Not found |

---

# 5. المصادقة — Authentication

## client/src/lib/supabase.ts

**العربي:**  
هذا الملف ينشئ اتصال Supabase من متغيرات البيئة:

- VITE_SUPABASE_URL
- VITE_SUPABASE_PUBLISHABLE_KEY

ويقدم وظائف مثل تسجيل الدخول، التسجيل، تسجيل الخروج وقراءة جلسة Supabase.

**English:**  
This file creates the Supabase client from environment variables and exposes helpers for authentication:

- get session
- sign in
- sign up
- sign out

**مهم — Important:**  
المفتاح الموجود في الواجهة هو publishable/anon-level configuration. الأسرار الحساسة مثل service-role keys يجب ألا تدخل إلى frontend.

---

## client/src/lib/auth.ts

**العربي:**  
هذا ملف مصادقة محلي مساعد. يحتوي على:

- SHA-256 hashing لمفتاح التطبيق القديم.
- التحقق من المفتاح.
- تخزين جلسة مؤقتة.
- تحديد مدة الجلسة.
- حماية من المحاولات المتكررة.

هذا **ليس بديلًا عن Supabase Auth** في النظام السحابي الحالي.

**English:**  
This is a local authentication helper containing:

- SHA-256 hashing for the legacy application key.
- Key verification.
- Temporary session handling.
- Session expiration.
- Login-attempt throttling.

It is **not the replacement for Supabase Auth** used by the current cloud system.

---

# 6. بوابة الدخول ومساحة العمل — Auth and workspace gate

## client/src/components/CloudAuthGate.tsx

**العربي:**  
هذا من أهم ملفات المشروع. يقرر هل المستخدم:

1. غير مسجل → تظهر شاشة تسجيل الدخول/التسجيل.
2. مسجل لكن لا يملك مساحة → إنشاء مساحة أو الانضمام إليها.
3. يملك مساحة → التحقق من العضوية ثم فتحها.
4. حدث خطأ بالسحابة → يمنع فتح بيانات محلية قديمة بدلًا من الادعاء أن البيانات الحالية مؤكدة.

**English:**  
This is one of the core application components. It decides whether the user:

1. Is unauthenticated.
2. Is authenticated but has no workspace.
3. Has a valid workspace membership and can enter it.
4. Has a cloud error, in which case stale local accounting data is not silently opened.

---

# 7. الاتصال والمزامنة — Cloud synchronization

## client/src/lib/supabaseSync.ts

**العربي:**  
هذا الملف هو طبقة المزامنة الأساسية بين واجهة التطبيق وPostgreSQL.

مسؤوليته تشمل:

- التحقق من الوصول إلى Workspace.
- جلب الحسابات من السحابة.
- جلب الحركات.
- إنشاء الحسابات.
- تحديث الحسابات.
- إنشاء وتحديث الحركات.
- توليد UUIDs للسجلات السحابية.
- معالجة معرفات محلية قديمة.
- التعامل مع تعارض الإصدارات.
- منع إعادة كتابة السجلات التي لم تتغير.

### Version conflict

كل سجل مهم لديه version.

الفكرة:

~~~text
Client version = 4
Server version = 4
        ↓
      update
        ↓
Server version = 5
~~~

إذا حاول جهاز آخر تعديل سجل أصبح إصداره مختلفًا، يمكن للنظام إظهار SyncConflictError بدل الكتابة فوق تعديل الجهاز الآخر.

**English:**  
This is the main synchronization layer between the React application and PostgreSQL. It handles workspace access, pull/push operations, remote IDs, version tracking, and optimistic concurrency protection.

---

# 8. التخزين المحلي — Local store

## client/src/lib/localStore.ts

**العربي:**  
هذا الملف موجود للتوافق مع أجزاء قديمة من المشروع. **ليس قاعدة بيانات المحاسبة الحالية**.

أي بيانات محاسبية حقيقية يجب أن تكون مرتبطة بمصدر السحابة الحالي وفق التصميم الموجود في المشروع.

**English:**  
This file exists mainly for compatibility with older code. It is **not the current accounting database**.

Do not redesign the application around browser storage without first changing the architecture deliberately.

---

# 9. التحقق من البيانات — Validation

## client/src/lib/validation.ts

**العربي:**  
يحتوي على قواعد التحقق من المدخلات قبل إرسالها أو اعتمادها، مثل البيانات النصية والمبالغ والحقول المطلوبة.

**English:**  
This file contains input validation rules used before accepting or sending data, including required fields, text values, and accounting amounts.

الهدف هو منع بيانات غير صحيحة من الوصول إلى منطق الحساب أو قاعدة البيانات.

---

# 10. النسخ والاستعادة — Backup and restoration

## client/src/lib/backup.ts

**العربي:**  
هذا الملف يتعامل مع عمليات النسخ والتصدير والاستعادة من جهة العميل، ويربط الواجهة بخدمة النسخ السحابية وملفات الاستعادة.

**English:**  
This client-side service coordinates backup, export, and restoration operations and connects the UI to the cloud backup function and portable restoration files.

---

## supabase/functions/workspace-backup/index.ts

**العربي:**  
هذه Edge Function تعمل على خوادم Supabase، وليست داخل المتصفح.

تقوم بـ:

- التحقق من Bearer token.
- التحقق من عضوية المستخدم في Workspace.
- إنشاء snapshot.
- حفظ النسخة في Supabase Storage.
- تصدير snapshot.
- التحقق من كلمة مرور الاستعادة.
- استعادة البيانات.
- فرض حدود للحجم وعدد السجلات.

الحدود الموجودة تمنع ملفات أو عمليات ضخمة غير متوقعة من الدخول إلى عملية الاستعادة.

**English:**  
This Supabase Edge Function runs server-side. It:

- validates the Bearer token,
- verifies workspace membership,
- creates snapshots,
- stores backups in Supabase Storage,
- exports snapshots,
- verifies restoration passwords,
- restores snapshots,
- enforces size and record-count limits.

**Security rule:**  
SUPABASE_SERVICE_ROLE_KEY belongs only on the server/Edge Function side. Never move it into frontend code.

---

# 11. الصفحة الرئيسية — Main page

## client/src/pages/Home.tsx

**العربي:**  
هذا أكبر ملف واجهة تقريبًا، وهو مسؤول عن الجزء الأساسي من تجربة التطبيق:

- Dashboard.
- الحسابات.
- تفاصيل الحساب.
- إضافة وتعديل الحركات.
- حساب الأرصدة.
- التنقل بين views.
- القائمة الجانبية.
- القائمة الجانبية للموبايل.
- النسخ والتصدير.
- حذف الحسابات/مساحة العمل.
- إشعارات النجاح والأخطاء.

**English:**  
This is the main application page and one of the largest source files. It contains the core workspace experience:

- dashboard,
- accounts,
- account details,
- transaction operations,
- balance calculations,
- view navigation,
- desktop/mobile navigation,
- backup/export actions,
- destructive actions,
- user notifications.

**ملاحظة مهمة — Important:**  
بسبب حجم هذا الملف، أي تعديل عليه يجب أن يكون صغيرًا ومحددًا مع اختبار الصفحة التي تم تعديلها.

---

# 12. الشريط الجانبي — Sidebar

## client/src/components/DesktopSidebar.tsx

**العربي:**  
يعرض تنقل الكمبيوتر:

- نظرة عامة
- الحسابات
- التعديلات
- صانع الفواتير
- دليل الاستخدام
- التحديثات
- الإعدادات

كما يحتوي على اختصارات للوضع الداكن والنسخ والتصدير وإجراءات الحساب.

**English:**  
This component renders desktop navigation and quick actions such as theme switching, backup, export, workspace actions, and logout.

---

# 13. دليل الاستخدام — User manual

## client/src/pages/Manual.tsx

**العربي:**  
صفحة دليل الاستخدام نفسها. تحتوي على:

- أقسام قابلة للفتح والإغلاق.
- البحث داخل الدليل.
- فتح الأقسام المطابقة للبحث.
- فهرس جانبي.
- حالة عدم وجود نتائج.
- تعليمات الاستخدام.

**English:**  
This page implements the User Manual:

- collapsible sections,
- search,
- automatic expansion of matching sections,
- manual index,
- empty-result state,
- usage instructions.

تم تحسين Responsive وسلوك البحث والحركة في هذه الصفحة في إصدارات سابقة.

---

# 14. تصميم وتحسينات الواجهة — UI enhancements

## client/src/index.css

**العربي:**  
ملف CSS الأساسي. يحتوي على القواعد العامة، المتغيرات، layout، responsive rules والأنماط العامة.

**English:**  
The main global stylesheet. It contains base styles, variables, layout rules, responsive behavior, and shared visual rules.

---

## client/src/ui-enhancements.css

**العربي:**  
ملف تحسينات فوق CSS الأساسي، ويحتوي على تفاصيل خاصة بالواجهة مثل:

- ألوان الأقسام.
- animations.
- hover effects.
- تحسينات Manual.
- mobile drawer.
- overlay.
- responsive fixes.
- dark-mode refinements.

**English:**  
A secondary enhancement stylesheet containing targeted UI improvements:

- section accents,
- animations,
- hover effects,
- Manual-page styling,
- mobile drawer behavior,
- overlays,
- responsive fixes,
- dark-mode refinements.

**قاعدة:**  
لا نضع منطق التطبيق هنا؛ هذا الملف للعرض والسلوك البصري فقط.

---

# 15. Theme

## client/src/contexts/ThemeContext.tsx

**العربي:**  
يوفر حالة الثيم ويتيح للتطبيق معرفة هل الوضع الحالي light أو dark وتغييره.

**English:**  
Provides global theme state and allows components to read and switch between light and dark modes.

---

# 16. Hooks

## client/src/hooks/useMobile.tsx

**العربي:**  
Hook لمعرفة ما إذا كان الجهاز/العرض مناسبًا لتعامل mobile.

**English:**  
A React hook for mobile/responsive detection.

## client/src/hooks/useComposition.ts

**العربي:**  
يساعد في التعامل مع إدخال النص أثناء composition، وهو مهم خصوصًا للغات التي تستخدم IME.

**English:**  
Handles text composition state, useful for IME-based text input.

## client/src/hooks/usePersistFn.ts

**العربي:**  
يحافظ على مرجع ثابت لدالة مع تحديث تنفيذها الداخلي.

**English:**  
Keeps a stable function reference while allowing its implementation to update.

---

# 17. صفحات التطبيق — Application pages

| File | عربي | English |
|---|---|---|
| pages/Home.tsx | الصفحة الأساسية ومساحة العمل | Main workspace |
| pages/Activity.tsx | سجل التعديلات | Activity/audit history |
| pages/Credits.tsx | معلومات فريق التطوير | Development credits |
| pages/InvoiceMaker.tsx | صانع الفواتير | Invoice builder |
| pages/Manual.tsx | دليل الاستخدام | User manual |
| pages/NotFound.tsx | صفحة 404 | 404 page |
| pages/Updates.tsx | سجل التحديثات داخل التطبيق | In-app updates |

---

# 18. مكونات UI — UI primitives

## client/src/components/ui/

**العربي:**  
هذا المجلد يحتوي على مكونات UI عامة مثل:

- Button
- Dialog
- Drawer
- Sheet
- Input
- Select
- Calendar
- Card
- Table
- Tooltip
- Toast/Sonner
- Sidebar
- Tabs
- Accordion
- وغيرها.

هذه المكونات مبنية باستخدام Radix/shadcn-style primitives.

**English:**  
This folder contains reusable UI primitives such as buttons, dialogs, drawers, sheets, inputs, selects, cards, tables, tooltips, sidebars, tabs, accordions, and similar components.

**قاعدة — Rule:**  
لا تعدّل هذه المكونات لمشكلة تخص صفحة واحدة إذا كان بالإمكان إصلاح المشكلة في الصفحة أو CSS الخاص بها.

---

# 19. قاعدة البيانات — Database

## supabase/schema.sql

**العربي:**  
يمثل مخطط قاعدة البيانات، بما فيه الجداول والعلاقات والقيود والسياسات.

**English:**  
Represents the PostgreSQL database schema, relationships, constraints, and security definitions.

## supabase/migrations/

كل migration تمثل تغييرًا محددًا في قاعدة البيانات.

أمثلة مهمة:

- 001_initial_schema.sql — إنشاء البنية الأساسية.
- 002_harden_workspace_and_account_deletion.sql — حماية عمليات الحذف.
- 003_rls_performance_and_security_hardening.sql — تحسين RLS والأمان والأداء.
- 004_workspace_member_rls_policy_split.sql — فصل سياسات عضوية Workspace.
- migrations بتاريخ 2026-09-25 — تحسينات Workspace، audit، backups، restore security وغيرها.

**English:**  
Each migration is an incremental database change. Migrations should be treated as history and should not be casually rewritten after deployment.

---

# 20. أهم الجداول — Main database tables

| Table | عربي | English |
|---|---|---|
| workspaces | مساحات العمل | Workspaces |
| workspace_members | أعضاء المساحة | Workspace memberships |
| profiles | ملفات المستخدمين | User profiles |
| accounts | حسابات الزبائن | Customer accounts |
| payments | الحركات | Payments/transactions |
| audit_log | سجل التعديلات | Audit log |

### العلاقة الأساسية — Core relationship

~~~text
User
  │
  ▼
Workspace Membership
  │
  ▼
Workspace
  │
  ├── Accounts
  │      │
  │      └── Payments
  │
  └── Audit Log
~~~

---

# 21. RLS — Row Level Security

**العربي:**  
RLS هي طبقة أمان داخل PostgreSQL. الفكرة ليست أن الواجهة فقط تخفي البيانات؛ قاعدة البيانات نفسها تتحقق من صلاحية المستخدم.

**English:**  
RLS is a database-level security boundary. The frontend does not merely hide unauthorized data; PostgreSQL policies enforce which rows the authenticated user can access.

**مهم — Important:**  
أي تعديل على RLS يحتاج اختبارًا دقيقًا لأن خطأ صغيرًا قد يمنع المستخدم الصحيح من الوصول أو يسمح بوصول غير مقصود.

---

# 22. Server

## server/index.ts

**العربي:**  
خادم Express بسيط يخدم الملفات المبنية من Vite، ويعيد index.html للمسارات حتى تعمل SPA routing.

**English:**  
A small Express server that serves the built frontend and falls back to index.html so client-side routing works correctly.

هو ليس مكان منطق المحاسبة الأساسي.

---

# 23. البناء — Build system

## package.json

**العربي:**  
يحدد:

- dependencies.
- scripts.
- TypeScript/Vite/React packages.
- Supabase client.
- UI libraries.
- testing/build tooling.

الأوامر المهمة:

~~~bash
pnpm check
pnpm build
pnpm dev
~~~

**English:**  
Defines dependencies and project scripts.

- pnpm check → TypeScript validation.
- pnpm build → production build.
- pnpm dev → development server.

---

# 24. GitHub Actions

## .github/workflows/quality.yml

**العربي:**  
يشغل فحوصات الجودة بشكل آلي عند التغييرات المناسبة في المستودع.

**English:**  
Runs automated quality checks through GitHub Actions so common type/build problems can be detected before release.

---

# 25. Vite

## vite.config.ts

**العربي:**  
إعدادات Vite، وهو المسؤول عن development server وproduction frontend build والـplugins.

**English:**  
Vite configuration for development, production builds, and project plugins.

---

# 26. الملفات العامة — Public assets

## client/public/

يحتوي على أصول عامة مثل:

- manifest.json
- icon.svg
- ملفات مرتبطة بالـPWA/runtime.

The public directory contains assets served directly by the browser.

---

# 27. ملفات الاختبار والمساعدة — Tests and utilities

## client/src/lib/supabase-config.test.ts

**العربي:**  
اختبار متعلق بإعداد Supabase.

**English:**  
A test covering Supabase configuration behavior.

## scripts/

**العربي:**  
سكريبتات مساعدة لمعالجة أو إصلاحات محددة أثناء التطوير.

**English:**  
Development/maintenance scripts used for targeted project operations.

---

# 28. كيف تتحرك البيانات؟ — How data flows

### إنشاء حساب — Creating an account

~~~text
User
 ↓
Home.tsx
 ↓
Supabase sync layer
 ↓
PostgreSQL
 ↓
RLS checks
 ↓
Account stored
 ↓
UI refresh
~~~

### إضافة حركة — Adding a payment

~~~text
User enters transaction
        ↓
Validation
        ↓
Home / sync logic
        ↓
Supabase
        ↓
payments table
        ↓
version update
        ↓
account balance refresh
~~~

### النسخ — Backup

~~~text
User
 ↓
Backup client helper
 ↓
workspace-backup Edge Function
 ↓
membership verification
 ↓
PostgreSQL snapshot
 ↓
Supabase Storage
~~~

---

# 29. ما الذي يجب الحذر منه؟ — What should be treated carefully?

## لا تعدّل مباشرة — Avoid casual changes to

1. **RLS policies** — لأنها طبقة أمان قاعدة البيانات.
2. **Supabase migrations** — لأنها تاريخ تغييرات قاعدة البيانات.
3. **supabaseSync.ts** — لأنه يتحكم بالمزامنة والتعارضات.
4. **CloudAuthGate.tsx** — لأنه يتحكم بالدخول ومساحات العمل.
5. **workspace-backup Edge Function** — لأنه يتعامل مع النسخ والاستعادة وعمليات ذات صلاحيات عالية.
6. **Home.tsx** — لأنه يحتوي كمية كبيرة من منطق التطبيق.
7. **localStore.ts** — لا تعيده كمصدر بيانات محلي للمحاسبة بدون قرار معماري واضح.

---

# 30. قواعد التطوير — Development rules

**العربي:**

عند إصلاح bug:

1. حدد الصفحة التي ظهر فيها الخطأ.
2. افهم السبب قبل تعديل الكود.
3. عدّل أقل عدد ممكن من الملفات.
4. لا تغيّر منطقًا يعمل لمجرد تحسين الشكل.
5. اختبر الصفحة التي ظهر فيها الخطأ.
6. اختبر الصفحات المشابهة.
7. اختبر Mobile وDesktop.
8. شغّل type check/build.
9. تأكد من أن Vercel deployment أصبح READY.
10. أعد تجربة نفس السيناريو الذي سبب المشكلة.

**English:**

For every bug fix:

1. Identify the exact page where it appears.
2. Understand the root cause first.
3. Change the smallest necessary surface.
4. Do not change working business logic for cosmetic reasons.
5. Test the affected page.
6. Test related pages.
7. Test mobile and desktop.
8. Run type-check/build validation.
9. Verify the Vercel deployment is READY.
10. Reproduce the original scenario again after deployment.

---

# 31. الخلاصة — Summary

**العربي:**  
يمكن تقسيم المشروع إلى أربع طبقات رئيسية:

~~~text
UI
↓
Application logic
↓
Supabase client / Edge Functions
↓
PostgreSQL + RLS + Storage
~~~

الواجهة ليست قاعدة البيانات.  
Supabase/PostgreSQL هو مصدر البيانات السحابية، وRLS هي طبقة الحماية، وEdge Functions تنفذ العمليات الحساسة على الخادم.

**English:**  
The project can be understood as four major layers:

~~~text
UI
↓
Application logic
↓
Supabase client / Edge Functions
↓
PostgreSQL + RLS + Storage
~~~

The UI is not the database. Supabase/PostgreSQL is the cloud data source, RLS provides database-level access control, and Edge Functions handle sensitive server-side operations.

---

## Related documentation

- [Architecture](ARCHITECTURE.md)
- [Setup](SETUP.md)
- [Deployment](DEPLOY.md)
- [Release Notes](RELEASE-NOTES.md)

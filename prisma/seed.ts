import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const SEED_REVIEWS = [
  { name: 'Saad M., CA Finalist', rating: 5, content: "The clarity provided on Section 149 (Minimum Tax) is better than any textbook I've read. Essential for anyone appearing in ICAP exams.", date: '2 weeks ago' },
  { name: 'Farhan A.', rating: 5, content: 'Very high quality production. The case study on tax treaty conflicts was particularly eye-opening. Highly recommended for professionals.', date: '1 month ago' },
  { name: 'Zara Sheikh', rating: 4, content: 'Comprehensive content with practical examples. Would have liked more interactive exercises, but overall excellent value.', date: '1 month ago' },
  { name: 'Omar Raza', rating: 5, content: "This course transformed how I approach client tax planning. The instructor's real-world experience shines through in every module.", date: '3 months ago' },
  { name: 'Hina Tariq', rating: 4, content: 'Great course for beginners. The FBR portal walkthrough was especially helpful. Would love a follow-up advanced course.', date: '2 months ago' },
];

const COURSES_DATA = [
  {
    name: 'Mastering Income Tax Ordinances 2001',
    description: 'Master the complete process of filing income tax returns with FBR. Updated for 2025 regulations.',
    longDescription: 'This comprehensive course covers everything you need to know about the Income Tax Ordinance 2001. Learn the latest regulations, forms, deadlines, and best practices. Perfect for professionals, self-employed individuals, and tax practitioners looking to master compliance. Includes practical walkthroughs of FBR IRIS portal, real-world case studies, and mock exam preparation.',
    originalFee: 25000,
    discountedFee: 15500,
    category: 'Income Tax',
    level: 'Intermediate',
    duration: 16,
    language: 'English & Urdu',
    badge: 'bestseller',
    thumbnail: 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=600&h=340&fit=crop',
    instructorName: 'Barrister Ahmed Khan',
    instructorTitle: 'Senior Tax Consultant & SC Advocate',
    instructorBio: 'With over 20 years of experience in Pakistani corporate law, Barrister Ahmed has successfully represented dozens of Fortune 100 companies in tax litigation before the Appellate Tribunals and High Courts. He is a frequent contributor to leading financial journals and a visiting professor at the National Academy of Taxation.',
    instructorImage: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop'
  },
  {
    name: 'Corporate Accounting with IFRS Standards',
    description: 'Learn international financial reporting standards and corporate accounting principles.',
    longDescription: 'A deep dive into International Financial Reporting Standards (IFRS) and corporate accounting. Designed for finance professionals and accountants working in multinational corporations who need to master global reporting standards. Covers IFRS 9, 15, 16 and consolidation.',
    originalFee: 35000,
    discountedFee: 22500,
    category: 'Corporate Accounting',
    level: 'Advanced',
    duration: 24,
    language: 'English',
    badge: null,
    thumbnail: 'https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=600&h=340&fit=crop',
    instructorName: 'Dr. Ayesha Ali, PhD',
    instructorTitle: 'IFRS & Corporate Accounting Lead',
    instructorBio: 'International accounting standards expert with 12 years in multinational corporations. IFRS-certified trainer who has trained over 5,000 professionals across South Asia.',
    instructorImage: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&h=200&fit=crop'
  },
  {
    name: 'Advanced Sales Tax & VAT Compliance',
    description: 'Complete guide to sales tax compliance, audit preparation, and VAT implementation.',
    longDescription: 'Master sales tax regulations, filing requirements, and audit defense strategies. Ideal for practitioners, business owners, and tax consultants working across multiple tax jurisdictions in Pakistan.',
    originalFee: 18000,
    discountedFee: 12000,
    category: 'Sales Tax & GST',
    level: 'Intermediate',
    duration: 14,
    language: 'English & Urdu',
    badge: 'new',
    thumbnail: 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=600&h=340&fit=crop',
    instructorName: 'Fatima Khan, FCA',
    instructorTitle: 'Bookkeeping & Small Business Expert',
    instructorBio: 'Dedicated to helping small business owners master bookkeeping and tax planning. Published author and frequent conference speaker with expertise in modern accounting software integration and FBR IRIS portal training.',
    instructorImage: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop'
  },
  {
    name: 'Bookkeeping for Small Businesses',
    description: 'Essential bookkeeping skills for entrepreneurs. No accounting background required.',
    longDescription: 'Learn the fundamentals of bookkeeping, from basic journal entries to preparing financial statements. This beginner-friendly course requires no prior accounting knowledge and will have you confidently managing your business books.',
    originalFee: 0,
    discountedFee: 0,
    category: 'Bookkeeping',
    level: 'Beginner',
    duration: 12,
    language: 'English & Urdu',
    badge: 'free',
    thumbnail: 'https://images.unsplash.com/photo-1521791136064-7986c2920216?w=600&h=340&fit=crop',
    instructorName: 'Fatima Khan, FCA',
    instructorTitle: 'Bookkeeping & Small Business Expert',
    instructorBio: 'Dedicated to helping small business owners master bookkeeping and tax planning. Published author and frequent conference speaker with expertise in modern accounting software integration and FBR IRIS portal training.',
    instructorImage: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop'
  },
  {
    name: 'FBR Compliance Essentials for Businesses',
    description: 'Stay compliant with Federal Board of Revenue regulations and avoid penalties.',
    longDescription: 'A practical guide to understanding FBR requirements, documentation, and compliance strategies for businesses of all sizes operating in Pakistan. Covers registration, record-keeping, and audit preparation.',
    originalFee: 14000,
    discountedFee: 8500,
    category: 'FBR Compliance',
    level: 'Beginner',
    duration: 10,
    language: 'English & Urdu',
    badge: null,
    thumbnail: 'https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=600&h=340&fit=crop',
    instructorName: 'Barrister Ahmed Khan',
    instructorTitle: 'Senior Tax Consultant & SC Advocate',
    instructorBio: 'With over 20 years of experience in Pakistani corporate law, Barrister Ahmed has successfully represented dozens of Fortune 100 companies in tax litigation before the Appellate Tribunals and High Courts. He is a frequent contributor to leading financial journals and a visiting professor at the National Academy of Taxation.',
    instructorImage: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop'
  },
  {
    name: 'Practical Guide to Tax Audits & Assurance',
    description: 'Introduction to audit processes, evidence collection, and reporting standards.',
    longDescription: 'Learn the principles of auditing, evidence collection, audit planning, and reporting. Essential for aspiring auditors and accounting professionals seeking to build a career in assurance services.',
    originalFee: 28000,
    discountedFee: 19000,
    category: 'Audit & Assurance',
    level: 'Intermediate',
    duration: 18,
    language: 'English',
    badge: 'bestseller',
    thumbnail: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=600&h=340&fit=crop',
    instructorName: 'Muhammad Saleem, ACCA',
    instructorTitle: 'Audit & Compliance Professional',
    instructorBio: 'Specialist in internal and external audits with 15 years at Big Four firms. Expert in corporate governance, COSO frameworks, and regulatory compliance across Pakistan and the Middle East.',
    instructorImage: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200&h=200&fit=crop'
  },
  {
    name: 'Introduction to Pakistani Tax Law',
    description: "Foundational overview of Pakistan's tax system for beginners.",
    longDescription: "A comprehensive introduction to the Pakistani tax landscape. Covers the constitution's tax provisions, federal vs provincial taxes, FBR structure, and fundamental concepts every citizen and business owner should understand.",
    originalFee: 0,
    discountedFee: 0,
    category: 'Income Tax',
    level: 'Beginner',
    duration: 8,
    language: 'English & Urdu',
    badge: 'free',
    thumbnail: 'https://images.unsplash.com/photo-1504639725590-34d0984388bd?w=600&h=340&fit=crop',
    instructorName: 'Barrister Ahmed Khan',
    instructorTitle: 'Senior Tax Consultant & SC Advocate',
    instructorBio: 'With over 20 years of experience in Pakistani corporate law, Barrister Ahmed has successfully represented dozens of Fortune 100 companies in tax litigation before the Appellate Tribunals and High Courts. He is a frequent contributor to leading financial journals and a visiting professor at the National Academy of Taxation.',
    instructorImage: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop'
  },
  {
    name: 'Forensic Accounting & FBR E-Filing',
    description: 'Analyze financial statements and master FBR electronic filing procedures.',
    longDescription: 'Learn to read, understand, and analyze financial statements with a forensic lens. Covers ratio analysis, trend analysis, fraud detection techniques, and a complete walkthrough of the FBR IRIS e-filing portal.',
    originalFee: 14000,
    discountedFee: 8500,
    category: 'Corporate Accounting',
    level: 'Intermediate',
    duration: 15,
    language: 'English & Urdu',
    badge: null,
    thumbnail: 'https://images.unsplash.com/photo-1611532736597-de2d4265fba3?w=600&h=340&fit=crop',
    instructorName: 'Dr. Ayesha Ali, PhD',
    instructorTitle: 'IFRS & Corporate Accounting Lead',
    instructorBio: 'International accounting standards expert with 12 years in multinational corporations. IFRS-certified trainer who has trained over 5,000 professionals across South Asia.',
    instructorImage: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&h=200&fit=crop'
  },
  {
    name: 'International Taxation & Treaty Obligations',
    description: 'Complete guide to cross-border taxation and double taxation treaties.',
    longDescription: 'Understand international tax regulations, treaty networks, transfer pricing rules, and compliance requirements for businesses operating across borders from Pakistan.',
    originalFee: 40000,
    discountedFee: 25000,
    category: 'Income Tax',
    level: 'Advanced',
    duration: 13,
    language: 'English',
    badge: null,
    thumbnail: 'https://images.unsplash.com/photo-1542744173-8e7e53415bb0?w=600&h=340&fit=crop',
    instructorName: 'Dr. Ayesha Ali, PhD',
    instructorTitle: 'IFRS & Corporate Accounting Lead',
    instructorBio: 'International accounting standards expert with 12 years in multinational corporations. IFRS-certified trainer who has trained over 5,000 professionals across South Asia.',
    instructorImage: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&h=200&fit=crop'
  },
  {
    name: 'Withholding Tax Obligations for Businesses',
    description: 'Master withholding tax documentation and record-keeping best practices.',
    longDescription: 'Learn what documents to maintain, how to organize withholding obligations, and how to prepare for tax audits with proper record keeping under current FBR rules.',
    originalFee: 0,
    discountedFee: 0,
    category: 'Sales Tax & GST',
    level: 'Beginner',
    duration: 8,
    language: 'English & Urdu',
    badge: 'free',
    thumbnail: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=600&h=340&fit=crop',
    instructorName: 'Barrister Ahmed Khan',
    instructorTitle: 'Senior Tax Consultant & SC Advocate',
    instructorBio: 'With over 20 years of experience in Pakistani corporate law, Barrister Ahmed has successfully represented dozens of Fortune 100 companies in tax litigation before the Appellate Tribunals and High Courts. He is a frequent contributor to leading financial journals and a visiting professor at the National Academy of Taxation.',
    instructorImage: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop'
  },
  {
    name: 'Tax Planning for High-Net-Worth Individuals',
    description: 'Advanced tax optimization techniques for high-income earners and businesses.',
    longDescription: 'Advanced strategies for minimizing tax liability through legal tax planning methods. Covers corporate structures, investment strategies, and maximum deductions for sophisticated taxpayers.',
    originalFee: 38000,
    discountedFee: 25000,
    category: 'Income Tax',
    level: 'Advanced',
    duration: 20,
    language: 'English',
    badge: null,
    thumbnail: 'https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?w=600&h=340&fit=crop',
    instructorName: 'Barrister Ahmed Khan',
    instructorTitle: 'Senior Tax Consultant & SC Advocate',
    instructorBio: 'With over 20 years of experience in Pakistani corporate law, Barrister Ahmed has successfully represented dozens of Fortune 100 companies in tax litigation before the Appellate Tribunals and High Courts. He is a frequent contributor to leading financial journals and a visiting professor at the National Academy of Taxation.',
    instructorImage: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop'
  },
  {
    name: 'Filing Personal Income Tax Returns (IRIS)',
    description: 'Hands-on guide to personal tax filing using FBR IRIS portal.',
    longDescription: 'Practical training in using FBR IRIS portal for personal tax return filing, understanding tax slabs, and claiming maximum deductions. Step-by-step screen recordings included.',
    originalFee: 15000,
    discountedFee: 9900,
    category: 'FBR Compliance',
    level: 'Beginner',
    duration: 16,
    language: 'English & Urdu',
    badge: 'bestseller',
    thumbnail: 'https://images.unsplash.com/photo-1568992687947-868a62a9f521?w=600&h=340&fit=crop',
    instructorName: 'Fatima Khan, FCA',
    instructorTitle: 'Bookkeeping & Small Business Expert',
    instructorBio: 'Dedicated to helping small business owners master bookkeeping and tax planning. Published author and frequent conference speaker with expertise in modern accounting software integration and FBR IRIS portal training.',
    instructorImage: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop'
  },
  {
    name: 'Internal Controls & Corporate Governance',
    description: 'Build effective internal control systems and governance frameworks.',
    longDescription: 'Learn to design and implement internal controls, compliance frameworks, and corporate governance best practices aligned with COSO and international standards.',
    originalFee: 0,
    discountedFee: 0,
    category: 'Audit & Assurance',
    level: 'Advanced',
    duration: 22,
    language: 'English',
    badge: 'free',
    thumbnail: 'https://images.unsplash.com/photo-1565514020179-026b92b84bb6?w=600&h=340&fit=crop',
    instructorName: 'Muhammad Saleem, ACCA',
    instructorTitle: 'Audit & Compliance Professional',
    instructorBio: 'Specialist in internal and external audits with 15 years at Big Four firms. Expert in corporate governance, COSO frameworks, and regulatory compliance across Pakistan and the Middle East.',
    instructorImage: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200&h=200&fit=crop'
  },
  {
    name: 'Record-Keeping & Audit Preparation',
    description: 'Master documentation requirements and audit-readiness best practices.',
    longDescription: 'Learn systematic record-keeping methods, document organization, and audit preparation strategies that will save you time and penalties. Includes checklists and templates.',
    originalFee: 9000,
    discountedFee: 5500,
    category: 'Bookkeeping',
    level: 'Intermediate',
    duration: 10,
    language: 'English & Urdu',
    badge: null,
    thumbnail: 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=600&h=340&fit=crop',
    instructorName: 'Muhammad Saleem, ACCA',
    instructorTitle: 'Audit & Compliance Professional',
    instructorBio: 'Specialist in internal and external audits with 15 years at Big Four firms. Expert in corporate governance, COSO frameworks, and regulatory compliance across Pakistan and the Middle East.',
    instructorImage: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200&h=200&fit=crop'
  },
  {
    name: 'CA Exam Preparation — Tax Module',
    description: 'Comprehensive CA exam prep covering all taxation topics.',
    longDescription: 'Intensive preparation for the CA examination tax module. Covers all major taxation topics with practice questions, mock exams, and detailed answer explanations aligned with ICAP requirements.',
    originalFee: 55000,
    discountedFee: 35000,
    category: 'Income Tax',
    level: 'Advanced',
    duration: 30,
    language: 'English',
    badge: 'bestseller',
    thumbnail: 'https://images.unsplash.com/photo-1544383835-bda2bc66a55d?w=600&h=340&fit=crop',
    instructorName: 'Dr. Ayesha Ali, PhD',
    instructorTitle: 'IFRS & Corporate Accounting Lead',
    instructorBio: 'International accounting standards expert with 12 years in multinational corporations. IFRS-certified trainer who has trained over 5,000 professionals across South Asia.',
    instructorImage: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&h=200&fit=crop'
  },
  {
    name: 'Payroll Management & EOBI Compliance',
    description: 'End-to-end payroll management including EOBI and social security.',
    longDescription: 'Learn to manage payroll processes including salary calculations, tax deductions, EOBI contributions, social security obligations, and compliance reporting for Pakistani businesses.',
    originalFee: 12000,
    discountedFee: 7500,
    category: 'Bookkeeping',
    level: 'Intermediate',
    duration: 12,
    language: 'English & Urdu',
    badge: null,
    thumbnail: 'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=600&h=340&fit=crop',
    instructorName: 'Fatima Khan, FCA',
    instructorTitle: 'Bookkeeping & Small Business Expert',
    instructorBio: 'Dedicated to helping small business owners master bookkeeping and tax planning. Published author and frequent conference speaker with expertise in modern accounting software integration and FBR IRIS portal training.',
    instructorImage: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop'
  }
];

function makeSeedModules(courseIndex: number) {
  const moduleNames = [
    'Legal Framework & Foundations',
    'Core Concepts & Principles',
    'Practical Application',
    'Advanced Topics',
    'Case Studies & Assessment',
  ];
  const count = 3 + (courseIndex % 3); // 3 to 5 modules
  const modules = [];
  for (let i = 0; i < count; i++) {
    const lessons = [];
    const lessonCount = 3 + (i % 2); // 3 to 4 lessons
    for (let j = 0; j < lessonCount; j++) {
      lessons.push({
        title: `Lesson ${i * 4 + j + 1}: ${['Introduction', 'Deep Dive', 'Practical Exercise', 'Assessment'][j] || 'Topic ' + (j + 1)}`,
        duration: 30 + (j * 15) + (i * 5),
        isPreview: i === 0 && j === 0,
        sortOrder: j,
      });
    }
    modules.push({
      title: moduleNames[i] || `Module ${i + 1}`,
      sortOrder: i,
      lessons,
    });
  }
  return modules;
}

async function main() {
  console.log('🧹 Cleaning database...');
  await prisma.class.deleteMany();
  await prisma.enrollment.deleteMany();
  await prisma.admission.deleteMany();
  await prisma.user.deleteMany();
  await prisma.batch.deleteMany();
  
  // Clean modules, lessons, reviews
  await prisma.courseReview.deleteMany();
  await prisma.courseLesson.deleteMany();
  await prisma.courseModule.deleteMany();
  await prisma.course.deleteMany();

  console.log('🌱 Seeding database...');

  // Seed courses with detailed models
  for (let idx = 0; idx < Math.min(10, COURSES_DATA.length); idx++) {
    const course = COURSES_DATA[idx];
    const modules = makeSeedModules(idx);
    
    // Choose 2 reviews for each course randomly
    const r1 = SEED_REVIEWS[idx % SEED_REVIEWS.length];
    const r2 = SEED_REVIEWS[(idx + 2) % SEED_REVIEWS.length];

    await prisma.course.create({
      data: {
        name: course.name,
        description: course.description,
        longDescription: course.longDescription,
        originalFee: course.originalFee,
        discountedFee: course.discountedFee,
        category: course.category,
        level: course.level,
        duration: course.duration,
        language: course.language,
        badge: course.badge,
        thumbnail: course.thumbnail,
        instructorName: course.instructorName,
        instructorTitle: course.instructorTitle,
        instructorBio: course.instructorBio,
        instructorImage: course.instructorImage,
        modules: {
          create: modules.map((m) => ({
            title: m.title,
            sortOrder: m.sortOrder,
            lessons: {
              create: m.lessons.map((l) => ({
                title: l.title,
                duration: l.duration,
                isPreview: l.isPreview,
                sortOrder: l.sortOrder,
              }))
            }
          }))
        },
        reviews: {
          create: [
            { name: r1.name, rating: r1.rating, content: r1.content, date: r1.date },
            { name: r2.name, rating: r2.rating, content: r2.content, date: r2.date }
          ]
        }
      }
    });
  }
  console.log(`✅ ${Math.min(10, COURSES_DATA.length)} detailed courses seeded`);

  // Seed admin user
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@premier.edu.pk';
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@123';
  const hashedPassword = await bcrypt.hash(adminPassword, 12);

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      name: 'Admin',
      role: 'admin',
      password: hashedPassword,
      isActive: true,
    },
  });
  console.log(`✅ Admin user seeded: ${adminEmail}`);

  console.log('🎉 Seeding complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

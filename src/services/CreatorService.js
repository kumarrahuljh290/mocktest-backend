import prisma from "../config/prisma.js";
import slugify from "slugify";

export class CreatorService {
    
    // ==========================================
    // 1. CREATOR ONBOARDING & LEGAL
    // ==========================================
    
    /**
     * Converts a standard student into a pending Creator.
     * Captures the legal copyright agreement timestamp.
     */
    static async applyToBeCreator(userId, data) {
        const { brandName, bio, acceptedCopyrightPolicy } = data;

        if (!acceptedCopyrightPolicy) {
            throw new Error("LEGAL_AGREEMENT_REQUIRED: You must accept the copyright terms to become a creator.");
        }

        // Generate a clean SEO-friendly slug (e.g., "sharma-math-academy")
        const baseSlug = slugify(brandName, { lower: true, strict: true });
        
        // Ensure slug uniqueness
        let uniqueSlug = baseSlug;
        let counter = 1;
        while (await prisma.creatorProfile.findUnique({ where: { slug: uniqueSlug } })) {
            uniqueSlug = `${baseSlug}-${counter}`;
            counter++;
        }

        return await prisma.$transaction(async (tx) => {
            // 1. Upgrade the user role
            await tx.user.update({
                where: { id: userId },
                data: { role: "CONTENT_CREATOR" }
            });

            // 2. Create the profile in PENDING state
            const profile = await tx.creatorProfile.create({
                data: {
                    userId: userId,
                    brandName: brandName,
                    slug: uniqueSlug,
                    bio: bio,
                    status: "PENDING", // Requires PrepMaster Admin approval
                    acceptedCopyrightPolicyAt: new Date() // Digital Legal Signature
                }
            });

            return profile;
        });
    }

    // ==========================================
    // 2. PUBLIC STOREFRONT (B2B2C DISCOVERY)
    // ==========================================

    /**
     * Fetches the public landing page for a creator using their unique URL slug.
     * Example: prepmaster.com/c/sharma-math-academy
     */
    static async getPublicStorefront(slug) {
        const creator = await prisma.creatorProfile.findUnique({
            where: { slug: slug },
            include: {
                // Include basic user info (Name, Email maybe masked)
                user: { select: { name: true, id: true } },
                // Calculate community size instantly
                _count: { select: { user: { select: { followers: true } } } }
            }
        });

        if (!creator || creator.status !== "ACTIVE") {
            throw new Error("CREATOR_NOT_FOUND_OR_INACTIVE");
        }

        // Fetch their public, root-level products/collections
        const publishedProducts = await prisma.product.findMany({
            where: { 
                creatorId: creator.userId, 
                isActive: true 
            },
            select: {
                id: true, name: true, slug: true, price: true, discountPrice: true,
                validityDays: true, features: true,
                // Count how many people bought it! (Great for social proof)
                _count: { select: { subscriptions: { where: { status: "ACTIVE" } } } }
            },
            orderBy: { createdAt: "desc" }
        });

        return {
            profile: {
                brandName: creator.brandName,
                bio: creator.bio,
                logoUrl: creator.logoUrl,
                bannerUrl: creator.bannerUrl,
                followersCount: creator._count.user.followers
            },
            storefront: publishedProducts
        };
    }

    // ==========================================
    // 3. FINANCIAL LEDGER & DASHBOARD ANALYTICS
    // ==========================================

    /**
     * Powers the Creator Dashboard.
     * Shows exactly how much money they made and how many students they have.
     */
    static async getCreatorDashboardStats(creatorId) {
        // 1. Calculate Lifetime Earnings
        const ledgerStats = await prisma.transaction.aggregate({
            where: { 
                creatorId: creatorId, 
                status: "SUCCESS" 
            },
            _sum: {
                creatorShare: true, // The 80% they keep
                finalAmount: true   // Total gross sales generated
            },
            _count: {
                id: true // Total number of sales
            }
        });

        // 2. Community & Content Metrics
        const contentStats = await prisma.user.findUnique({
            where: { id: creatorId },
            select: {
                _count: {
                    select: {
                        followers: true,
                        createdTests: true,
                        createdProducts: true
                    }
                }
            }
        });

        return {
            financials: {
                lifetimeEarnings: ledgerStats._sum.creatorShare || 0,
                grossSalesVolume: ledgerStats._sum.finalAmount || 0,
                totalTransactions: ledgerStats._count.id || 0,
            },
            metrics: {
                totalFollowers: contentStats._count.followers || 0,
                activeProducts: contentStats._count.createdProducts || 0,
                totalTestsCreated: contentStats._count.createdTests || 0,
            }
        };
    }
}
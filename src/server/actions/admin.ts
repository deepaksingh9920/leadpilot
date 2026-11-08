"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { formString } from "@/lib/form";
import { getClientIp, getUserAgent } from "@/lib/request";

const METRICS = [
  "leads_per_month",
  "agent_runs_per_month",
  "seats",
  "workspaces",
  "sends_per_day",
  "exports_per_month",
] as const;

function parseMoney(value: string): number | null {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100);
}

function parseLimit(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

export async function updatePlanAction(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session || !session.user.isSuperAdmin) redirect("/dashboard");

  const planId = formString(formData, "planId");
  const name = formString(formData, "name").trim();
  const description = formString(formData, "description").trim();
  const monthlyPrice = parseMoney(formString(formData, "monthlyPrice"));
  const yearlyPrice = parseMoney(formString(formData, "yearlyPrice"));

  if (!planId || !name || !description || monthlyPrice === null || yearlyPrice === null) {
    redirect("/admin?error=invalid");
  }

  const limits = METRICS.map((metric) => ({
    metric,
    value: parseLimit(formString(formData, `limit_${metric}`)),
  }));
  if (limits.some((limit) => limit.value === null)) {
    redirect("/admin?error=limits");
  }

  const plan = await db.plan.findUnique({ where: { id: planId } });
  if (!plan) redirect("/admin?error=missing");

  const providerPrices = [
    {
      interval: "MONTHLY",
      externalPlanId: formString(formData, "razorpayMonthlyPlanId").trim().slice(0, 120),
    },
    {
      interval: "YEARLY",
      externalPlanId: formString(formData, "razorpayYearlyPlanId").trim().slice(0, 120),
    },
  ];
  if (
    providerPrices.some(
      (price) => price.externalPlanId && !/^[A-Za-z0-9_-]{3,120}$/.test(price.externalPlanId),
    )
  ) {
    redirect("/admin?error=provider-price");
  }

  try {
    await db.$transaction(async (tx) => {
      await tx.plan.update({
        where: { id: planId },
        data: {
          name,
          description,
          monthlyPrice,
          yearlyPrice,
          isActive: formString(formData, "isActive") === "on",
          isPublic: formString(formData, "isPublic") === "on",
        },
      });

      for (const limit of limits) {
        await tx.planLimit.upsert({
          where: { planId_metric: { planId, metric: limit.metric } },
          update: { limit: limit.value as number },
          create: { planId, metric: limit.metric, limit: limit.value as number },
        });
      }

      for (const price of providerPrices) {
        if (!price.externalPlanId) {
          await tx.planProviderPrice.deleteMany({
            where: { planId, provider: "razorpay", interval: price.interval },
          });
          continue;
        }
        await tx.planProviderPrice.upsert({
          where: {
            planId_provider_interval: {
              planId,
              provider: "razorpay",
              interval: price.interval,
            },
          },
          update: { externalPlanId: price.externalPlanId },
          create: {
            planId,
            provider: "razorpay",
            interval: price.interval,
            externalPlanId: price.externalPlanId,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: session.user.id,
          action: "plan.updated",
          entityType: "Plan",
          entityId: planId,
          metadata: JSON.stringify({
            previous: {
              name: plan.name,
              monthlyPrice: plan.monthlyPrice,
              yearlyPrice: plan.yearlyPrice,
            },
            next: { name, monthlyPrice, yearlyPrice },
            providerPrices,
          }),
          ip: await getClientIp(),
          userAgent: await getUserAgent(),
        },
      });
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      redirect("/admin?error=provider-price");
    }
    throw error;
  }

  revalidatePath("/admin");
  revalidatePath("/pricing");
  redirect("/admin?saved=1");
}

import { useEffect } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { trpc } from "@/lib/trpc";
import {
  Check,
  CreditCard,
  ExternalLink,
  Loader2,
  Sparkles,
} from "lucide-react";

type PaidPlanId = "starter" | "pro" | "agency";

export default function Billing() {
  const { loading, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const canFetchBilling = isAuthenticated && !loading;

  const { data: plans, isLoading: plansLoading } = trpc.billing.plans.useQuery(
    undefined,
    { enabled: canFetchBilling }
  );
  const { data: billing, isLoading: billingLoading } =
    trpc.billing.current.useQuery(undefined, { enabled: canFetchBilling });

  const changePlan = trpc.billing.changePlan.useMutation({
    onSuccess: async result => {
      if (result.url) {
        window.location.href = result.url;
        return;
      }
      await utils.billing.current.invalidate();
      await utils.accounts.getOrCreate.invalidate();
      toast.success(result.message ?? "Billing updated");
    },
    onError: error => toast.error(error.message),
  });

  const portal = trpc.billing.createPortalSession.useMutation({
    onSuccess: result => {
      if (result.url) {
        window.location.href = result.url;
        return;
      }
      toast.info(result.message ?? "Billing portal is not configured locally");
    },
    onError: error => toast.error(error.message),
  });

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate("/");
    }
  }, [isAuthenticated, loading, navigate]);

  if (loading || billingLoading || plansLoading) {
    return (
      <DashboardLayout>
        <div className="flex h-96 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#89CFF0]" />
        </div>
      </DashboardLayout>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  const currentPlan = billing?.account.plan ?? "trial";
  const usage = billing?.usage;

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-[#89CFF0]">Billing</h1>
            <p className="mt-2 text-[#c8ecfb]">
              Manage your plan, SMS conversation limits, and Stripe billing.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => portal.mutate()}
            disabled={portal.isPending}
          >
            {portal.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CreditCard className="h-4 w-4" />
            )}
            Manage billing
          </Button>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle>Current Usage</CardTitle>
                <CardDescription>
                  New SMS conversations started this month
                </CardDescription>
              </div>
              <Badge className="border-[#89CFF0]/30 bg-[#89CFF0]/15 text-[#89CFF0]">
                {currentPlan.toUpperCase()}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-end justify-between gap-4">
              <div>
                <div className="text-4xl font-bold text-[#89CFF0]">
                  {usage?.monthlyConversations ?? 0}
                </div>
                <p className="text-sm text-[#c8ecfb]">
                  of {usage?.monthlyLimit ?? 0} monthly conversations
                </p>
              </div>
              <p className="max-w-sm text-right text-sm text-[#c8ecfb]">
                {usage?.reason}
              </p>
            </div>
            <Progress
              value={usage?.percent ?? 0}
              className="bg-[#89CFF0]/15"
            />
          </CardContent>
        </Card>

        <div className="grid gap-5 lg:grid-cols-3">
          {plans?.map(plan => {
            const isCurrent = currentPlan === plan.id;
            const isChanging =
              changePlan.isPending &&
              changePlan.variables?.plan === (plan.id as PaidPlanId);

            return (
              <Card
                key={plan.id}
                className={`relative overflow-hidden ${
                  plan.id === "pro" ? "border-[#ff8fc7]/45" : ""
                }`}
              >
                {plan.id === "pro" ? (
                  <div className="absolute right-4 top-4">
                    <Badge className="border-transparent bg-[#ff8fc7] text-[#17112c]">
                      Popular
                    </Badge>
                  </div>
                ) : null}
                <CardHeader className="space-y-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[#89CFF0]/15 text-[#89CFF0]">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle>{plan.name}</CardTitle>
                    <CardDescription>{plan.description}</CardDescription>
                  </div>
                  <div className="flex items-end gap-1 text-[#89CFF0]">
                    <span className="text-4xl font-bold">
                      ${plan.monthlyPrice}
                    </span>
                    <span className="pb-1 text-sm text-[#c8ecfb]">/month</span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="space-y-3">
                    {plan.features.map(feature => (
                      <div
                        key={feature}
                        className="flex items-start gap-3 text-sm text-[#dff7ff]"
                      >
                        <Check className="mt-0.5 h-4 w-4 text-[#b8ffdc]" />
                        <span>{feature}</span>
                      </div>
                    ))}
                  </div>
                  <Button
                    className="w-full"
                    variant={isCurrent ? "outline" : "default"}
                    disabled={isCurrent || isChanging || changePlan.isPending}
                    onClick={() =>
                      changePlan.mutate({ plan: plan.id as PaidPlanId })
                    }
                  >
                    {isChanging ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : isCurrent ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <ExternalLink className="h-4 w-4" />
                    )}
                    {isCurrent ? "Current plan" : "Choose plan"}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </DashboardLayout>
  );
}

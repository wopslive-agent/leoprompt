import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { maskPhone } from "@/lib/phone";
import { useLocation } from "wouter";
import {
  MessageCircle,
  TrendingUp,
  Users,
  AlertCircle,
  Loader2,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { useEffect } from "react";

export default function Dashboard() {
  const { user, loading, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const canFetchDashboard = isAuthenticated && !loading;
  const { data: account, isLoading: accountLoading } =
    trpc.accounts.getOrCreate.useQuery(undefined, {
      enabled: canFetchDashboard,
    });
  const { data: conversations, isLoading: conversationsLoading } =
    trpc.conversations.list.useQuery(
      { limit: 10 },
      { enabled: canFetchDashboard }
    );
  const { data: leads } = trpc.leads.list.useQuery(
    {
      limit: 10,
    },
    { enabled: canFetchDashboard }
  );

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate("/");
    }
  }, [isAuthenticated, loading, navigate]);

  useEffect(() => {
    if (account && account.businessName === "My Business") {
      navigate("/onboarding");
    }
  }, [account, navigate]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-8 h-8 animate-spin text-[#89CFF0]" />
        </div>
      </DashboardLayout>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  // Check if this is first time (no account setup)
  if (accountLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-8 h-8 animate-spin text-[#89CFF0]" />
        </div>
      </DashboardLayout>
    );
  }

  if (account && account.businessName === "My Business") {
    return null;
  }

  // Calculate stats
  const totalConversations = conversations?.length || 0;
  const qualifiedLeads =
    leads?.filter(l => l.status === "qualified").length || 0;
  const pendingHandoffs =
    conversations?.filter(c => c.shouldHandoff).length || 0;
  const rejectedCount =
    conversations?.filter(c => c.status === "rejected").length || 0;

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-[#89CFF0]">
            Welcome back, {user?.name}
          </h1>
          <p className="text-[#c8ecfb] mt-2">
            Here's what's happening with {account?.businessName}
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-[#c8ecfb]">
                Total Conversations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-3xl font-bold text-[#89CFF0]">
                  {totalConversations}
                </div>
                <MessageCircle className="w-8 h-8 text-[#89CFF0] opacity-50" />
              </div>
              <p className="text-xs text-[#c8ecfb] mt-2">This month</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-[#c8ecfb]">
                Qualified Leads
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-3xl font-bold text-[#89CFF0]">
                  {qualifiedLeads}
                </div>
                <TrendingUp className="w-8 h-8 text-[#b8ffdc] opacity-50" />
              </div>
              <p className="text-xs text-[#c8ecfb] mt-2">Ready for booking</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-[#c8ecfb]">
                Pending Handoffs
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-3xl font-bold text-[#89CFF0]">
                  {pendingHandoffs}
                </div>
                <AlertCircle className="w-8 h-8 text-[#ffc28f] opacity-50" />
              </div>
              <p className="text-xs text-[#c8ecfb] mt-2">Need your attention</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-[#c8ecfb]">
                Rejected
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-3xl font-bold text-[#89CFF0]">
                  {rejectedCount}
                </div>
                <Users className="w-8 h-8 text-[#ff9ab3] opacity-50" />
              </div>
              <p className="text-xs text-[#c8ecfb] mt-2">Not qualified</p>
            </CardContent>
          </Card>
        </div>

        {/* Recent Conversations */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Recent Conversations</CardTitle>
                <CardDescription>
                  Latest activity from your SMS inbox
                </CardDescription>
              </div>
              <Button variant="outline" asChild>
                <a href="/conversations">View All</a>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {conversationsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-[#89CFF0]" />
              </div>
            ) : conversations && conversations.length > 0 ? (
              <div className="space-y-4">
                {conversations.slice(0, 5).map(conv => (
                  <div
                    key={conv.id}
                    className="flex items-center justify-between p-4 border border-[#89CFF0]/18 rounded-lg hover:bg-[#17112c]/55 cursor-pointer transition-colors"
                    onClick={() => navigate(`/conversations/${conv.id}`)}
                  >
                    <div className="flex-1">
                      <p className="font-medium text-[#89CFF0]">
                        {maskPhone(conv.customerPhone)}
                      </p>
                      <p className="text-sm text-[#c8ecfb]">
                        {conv.updatedAt
                          ? new Date(conv.updatedAt).toLocaleString()
                          : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium ${
                          conv.status === "qualified"
                            ? "bg-[#b8ffdc] text-[#123222]"
                            : conv.status === "rejected"
                              ? "bg-[#ff9ab3] text-[#3a1018]"
                              : conv.status === "collecting_details"
                                ? "bg-[#89CFF0] text-[#17112c]"
                                : "bg-[#2a1848] text-[#dff5ff]"
                        }`}
                      >
                        {conv.status.replace(/_/g, " ")}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <MessageCircle className="w-12 h-12 text-[#89CFF0]/35 mx-auto mb-3" />
                <p className="text-[#c8ecfb]">No conversations yet</p>
                <p className="text-sm text-[#b8e7fb]/80">
                  Share your Twilio number to start receiving SMS inquiries
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Button asChild variant="outline" className="h-auto py-4">
                <a href="/settings">Configure Settings</a>
              </Button>
              <Button asChild variant="outline" className="h-auto py-4">
                <a href="/leads">View All Leads</a>
              </Button>
              <Button asChild variant="outline" className="h-auto py-4">
                <a href="/conversations">Manage Conversations</a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

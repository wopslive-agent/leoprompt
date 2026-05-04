import { useEffect, useState } from "react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { Bot, Bug, Loader2, MessageSquareText, Sparkles } from "lucide-react";

export default function AITraining() {
  const { loading, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [persona, setPersona] = useState("");
  const [sampleMessage, setSampleMessage] = useState(
    "Hi, I need a quote for a 60 person event next month."
  );
  const [variantB, setVariantB] = useState("");
  const [conversationId, setConversationId] = useState("");

  const canFetch = isAuthenticated && !loading;
  const { data: account, isLoading: accountLoading } =
    trpc.accounts.getOrCreate.useQuery(undefined, { enabled: canFetch });
  const { data: conversations } = trpc.conversations.list.useQuery(
    { limit: 25 },
    { enabled: canFetch }
  );
  const { data: analytics, isLoading: analyticsLoading } =
    trpc.aiTraining.analytics.useQuery(undefined, { enabled: canFetch });
  const sandbox = trpc.aiTraining.promptSandbox.useMutation();
  const comparePrompts = trpc.aiTraining.comparePrompts.useMutation();

  useEffect(() => {
    if (account?.aiPersona) {
      setPersona(account.aiPersona);
      setVariantB(`${account.aiPersona}\n\nAsk one concise follow-up question at a time.`);
    }
  }, [account]);

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate("/");
    }
  }, [isAuthenticated, loading, navigate]);

  if (loading || accountLoading || analyticsLoading) {
    return (
      <DashboardLayout>
        <div className="flex h-96 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#89CFF0]" />
        </div>
      </DashboardLayout>
    );
  }

  if (!isAuthenticated) return null;

  const ratingCounts = analytics?.ratingCounts ?? {
    works_well: 0,
    needs_improvement: 0,
    bug: 0,
  };

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-[#89CFF0]">AI Training</h1>
          <p className="mt-2 text-[#c8ecfb]">
            Review response quality, test prompt changes, and replay recent
            conversations before updating your live assistant.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-[#c8ecfb]">
                Works Well
              </CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <span className="text-3xl font-bold text-[#89CFF0]">
                {ratingCounts.works_well}
              </span>
              <Sparkles className="h-7 w-7 text-[#b8ffdc]" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-[#c8ecfb]">
                Needs Work
              </CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <span className="text-3xl font-bold text-[#89CFF0]">
                {ratingCounts.needs_improvement}
              </span>
              <MessageSquareText className="h-7 w-7 text-[#ffc28f]" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-[#c8ecfb]">Bugs</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <span className="text-3xl font-bold text-[#89CFF0]">
                {ratingCounts.bug}
              </span>
              <Bug className="h-7 w-7 text-[#ff9ab3]" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-[#c8ecfb]">
                Parse Errors
              </CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <span className="text-3xl font-bold text-[#89CFF0]">
                {analytics?.parseErrors ?? 0}
              </span>
              <Bot className="h-7 w-7 text-[#89CFF0]" />
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <Card>
            <CardHeader>
              <CardTitle>Prompt Sandbox</CardTitle>
              <CardDescription>
                Try revised instructions against a new sample message or replay
                the latest context from a real conversation.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="persona">Persona Instructions</Label>
                <Textarea
                  id="persona"
                  rows={8}
                  value={persona}
                  onChange={event => setPersona(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sampleMessage">Sample Message</Label>
                <Textarea
                  id="sampleMessage"
                  rows={3}
                  value={sampleMessage}
                  onChange={event => setSampleMessage(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="conversationReplay">Replay Context</Label>
                <select
                  id="conversationReplay"
                  value={conversationId}
                  onChange={event => setConversationId(event.target.value)}
                  className="h-10 w-full rounded-md border border-[#89CFF0]/18 bg-[#17112c]/65 px-3 text-sm text-[#dff5ff] outline-none focus-visible:ring-2 focus-visible:ring-[#89CFF0]/35"
                >
                  <option value="">No replay context</option>
                  {conversations?.map(conversation => (
                    <option key={conversation.id} value={conversation.id}>
                      {conversation.customerPhone} ·{" "}
                      {String(conversation.status).replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                onClick={() =>
                  sandbox.mutate({
                    aiPersona: persona,
                    sampleMessage,
                    conversationId: conversationId
                      ? Number(conversationId)
                      : undefined,
                  })
                }
                disabled={sandbox.isPending || !persona || !sampleMessage}
              >
                {sandbox.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                Test Prompt
              </Button>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Sandbox Result</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {sandbox.data ? (
                  <>
                    {sandbox.data.demoMode ? (
                      <Badge className="border-[#ffc28f]/40 bg-[#ffc28f]/15 text-[#ffc28f]">
                        Demo fallback
                      </Badge>
                    ) : null}
                    <div>
                      <p className="text-sm font-medium text-[#dff5ff]">
                        Reply
                      </p>
                      <p className="mt-1 rounded-md bg-[#17112c]/65 p-3 text-sm text-[#c8ecfb]">
                        {(sandbox.data.result as any).reply ?? (sandbox.data.result as any).replyText}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-[#c8ecfb]">Status</p>
                        <p className="font-medium text-[#89CFF0]">
                          {(sandbox.data.result as any).intent ?? (sandbox.data.result as any).status}
                        </p>
                      </div>
                      <div>
                        <p className="text-[#c8ecfb]">Action</p>
                        <p className="font-medium text-[#89CFF0]">
                          {sandbox.data.result.nextAction}
                        </p>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-[#c8ecfb]">
                    Results will appear after you test a prompt.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Top Tags</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {analytics?.topTags.length ? (
                  analytics.topTags.map(tag => (
                    <Badge
                      key={tag.tag}
                      className="border-[#89CFF0]/30 bg-[#89CFF0]/15 text-[#89CFF0]"
                    >
                      {tag.tag} · {tag.count}
                    </Badge>
                  ))
                ) : (
                  <p className="text-sm text-[#c8ecfb]">
                    Tags from reviewed conversations will appear here.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>A/B Prompt Test</CardTitle>
            <CardDescription>
              Compare two instruction variants against the same message and
              replay context.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="variantA">Variant A</Label>
                <Textarea
                  id="variantA"
                  rows={6}
                  value={persona}
                  onChange={event => setPersona(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="variantB">Variant B</Label>
                <Textarea
                  id="variantB"
                  rows={6}
                  value={variantB}
                  onChange={event => setVariantB(event.target.value)}
                />
              </div>
            </div>
            <Button
              onClick={() =>
                comparePrompts.mutate({
                  variantA: persona,
                  variantB,
                  sampleMessage,
                  conversationId: conversationId
                    ? Number(conversationId)
                    : undefined,
                })
              }
              disabled={
                comparePrompts.isPending ||
                !persona ||
                !variantB ||
                !sampleMessage
              }
            >
              {comparePrompts.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Compare Variants
            </Button>
            {comparePrompts.data ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {[
                  ["A", comparePrompts.data.variantA],
                  ["B", comparePrompts.data.variantB],
                ].map(([label, result]) => (
                  <div
                    key={label as string}
                    className="rounded-lg border border-[#89CFF0]/18 bg-[#17112c]/45 p-4"
                  >
                    <p className="text-sm font-medium text-[#89CFF0]">
                      Variant {label as string}
                    </p>
                    <p className="mt-3 text-sm text-[#dff5ff]">
                      {(result as any).reply ?? (result as any).replyText}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Badge className="border-[#89CFF0]/30 bg-[#89CFF0]/15 text-[#89CFF0]">
                        {(result as any).intent ?? (result as any).status}
                      </Badge>
                      <Badge className="border-[#89CFF0]/30 bg-[#89CFF0]/15 text-[#89CFF0]">
                        {
                          (result as typeof comparePrompts.data.variantA)
                            .nextAction
                        }
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

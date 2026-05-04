import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { ChevronRight, Check } from "lucide-react";

export default function Onboarding() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    businessName: "",
    servicesOffered: "",
    pricing: "",
    availability: "",
    aiPersona: "",
  });

  const completeOnboarding = trpc.accounts.completeOnboarding.useMutation({
    onSuccess: () => {
      navigate("/dashboard");
    },
  });

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleNext = () => {
    if (step < 5) {
      setStep(step + 1);
    }
  };

  const handlePrevious = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const handleComplete = async () => {
    await completeOnboarding.mutateAsync(formData);
  };

  const steps = [
    {
      title: "Business Name",
      description: "What's your business called?",
      content: (
        <div className="space-y-4">
          <div>
            <Label htmlFor="businessName">Business Name</Label>
            <Input
              id="businessName"
              name="businessName"
              value={formData.businessName}
              onChange={handleInputChange}
              placeholder="e.g., Elegant Events"
              className="mt-2"
            />
          </div>
        </div>
      ),
    },
    {
      title: "Services Offered",
      description: "What services do you provide?",
      content: (
        <div className="space-y-4">
          <div>
            <Label htmlFor="servicesOffered">Services</Label>
            <Textarea
              id="servicesOffered"
              name="servicesOffered"
              value={formData.servicesOffered}
              onChange={handleInputChange}
              placeholder="e.g., Event planning, Coordination, Day-of coordination"
              className="mt-2"
              rows={4}
            />
          </div>
        </div>
      ),
    },
    {
      title: "Pricing",
      description: "How do you price your services?",
      content: (
        <div className="space-y-4">
          <div>
            <Label htmlFor="pricing">Pricing Information</Label>
            <Textarea
              id="pricing"
              name="pricing"
              value={formData.pricing}
              onChange={handleInputChange}
              placeholder="e.g., Starting at $500 for event coordination, custom quotes available"
              className="mt-2"
              rows={4}
            />
          </div>
        </div>
      ),
    },
    {
      title: "Availability",
      description: "When are you available?",
      content: (
        <div className="space-y-4">
          <div>
            <Label htmlFor="availability">Availability</Label>
            <Textarea
              id="availability"
              name="availability"
              value={formData.availability}
              onChange={handleInputChange}
              placeholder="e.g., Monday-Friday 9AM-6PM, Weekend events available"
              className="mt-2"
              rows={4}
            />
          </div>
        </div>
      ),
    },
    {
      title: "AI Persona",
      description: "Customize how your AI assistant communicates",
      content: (
        <div className="space-y-4">
          <div>
            <Label htmlFor="aiPersona">Assistant Instructions</Label>
            <Textarea
              id="aiPersona"
              name="aiPersona"
              value={formData.aiPersona}
              onChange={handleInputChange}
              placeholder="e.g., Be professional and friendly. Ask about event date, guest count, and budget. Always confirm availability before committing."
              className="mt-2"
              rows={4}
            />
          </div>
        </div>
      ),
    },
  ];

  const currentStep = steps[step - 1];

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_18%_12%,rgba(255,116,184,0.55),transparent_28%),linear-gradient(135deg,#1a1230_0%,#2a1848_48%,#5a35c8_100%)] py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-[#89CFF0] mb-2">
            Welcome to Leoprompt
          </h1>
          <p className="text-[#c8ecfb]">
            Let's set up your booking assistant in 5 minutes
          </p>
        </div>

        {/* Progress Indicator */}
        <div className="mb-8">
          <div className="flex justify-between mb-4">
            {steps.map((_, idx) => (
              <div key={idx} className="flex items-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-colors ${
                    idx + 1 < step
                      ? "bg-[#b8ffdc] text-[#123222]"
                      : idx + 1 === step
                        ? "bg-[#89CFF0] text-[#17112c]"
                        : "bg-[#3a215e] text-[#c8ecfb]"
                  }`}
                >
                  {idx + 1 < step ? <Check className="w-5 h-5" /> : idx + 1}
                </div>
                {idx < steps.length - 1 && (
                  <div
                    className={`h-1 flex-1 mx-2 transition-colors ${
                      idx + 1 < step ? "bg-[#b8ffdc]" : "bg-[#3a215e]"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-[#c8ecfb]">
            Step {step} of {steps.length}
          </p>
        </div>

        {/* Form Card */}
        <Card className="border border-[#89CFF0]/18 shadow-lg">
          <CardHeader>
            <CardTitle className="text-2xl">{currentStep.title}</CardTitle>
            <CardDescription className="text-base">
              {currentStep.description}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {currentStep.content}

            {/* Navigation Buttons */}
            <div className="flex gap-4 pt-6">
              <Button
                variant="outline"
                onClick={handlePrevious}
                disabled={step === 1}
                className="flex-1"
              >
                Previous
              </Button>
              {step === 5 ? (
                <Button
                  onClick={handleComplete}
                  disabled={completeOnboarding.isPending}
                  className="flex-1"
                >
                  {completeOnboarding.isPending
                    ? "Setting up..."
                    : "Complete Setup"}
                </Button>
              ) : (
                <Button onClick={handleNext} className="flex-1">
                  Next <ChevronRight className="w-4 h-4 ml-2" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Help Text */}
        <p className="text-center text-sm text-[#c8ecfb] mt-8">
          You can update these settings anytime in your account settings
        </p>
      </div>
    </div>
  );
}

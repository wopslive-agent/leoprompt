import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, Home } from "lucide-react";
import { useLocation } from "wouter";

export default function NotFound() {
  const [, setLocation] = useLocation();

  const handleGoHome = () => {
    setLocation("/");
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[radial-gradient(circle_at_18%_12%,rgba(255,116,184,0.55),transparent_28%),linear-gradient(135deg,#1a1230_0%,#2a1848_48%,#5a35c8_100%)]">
      <Card className="w-full max-w-lg mx-4 shadow-lg border-0 bg-[#24163f]/88 backdrop-blur-sm">
        <CardContent className="pt-8 pb-8 text-center">
          <div className="flex justify-center mb-6">
            <div className="relative">
              <div className="absolute inset-0 bg-[#ff9ab3] rounded-full animate-pulse" />
              <AlertCircle className="relative h-16 w-16 text-[#ff9ab3]" />
            </div>
          </div>

          <h1 className="text-4xl font-bold text-[#89CFF0] mb-2">404</h1>

          <h2 className="text-xl font-semibold text-[#dff5ff] mb-4">
            Page Not Found
          </h2>

          <p className="text-[#c8ecfb] mb-8 leading-relaxed">
            Sorry, the page you are looking for doesn't exist.
            <br />
            It may have been moved or deleted.
          </p>

          <div
            id="not-found-button-group"
            className="flex flex-col sm:flex-row gap-3 justify-center"
          >
            <Button
              onClick={handleGoHome}
              className="bg-[#89CFF0] px-6 py-2.5 text-[#17112c] shadow-md transition-all duration-200 hover:bg-[#a4ddf5] hover:shadow-lg"
            >
              <Home className="w-4 h-4 mr-2" />
              Go Home
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

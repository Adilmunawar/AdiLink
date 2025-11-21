import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import adiLinkLogo from '@/assets/adilink-logo.png';
import supporterSadiaSaad from '@/assets/supporter-sadia-saad.jpeg';
import supporterKomalWaheed from '@/assets/supporter-komal-waheed.jpeg';
import supporterMahnoorJaveed from '@/assets/supporter-mahnoor-javeed.jpeg';
import { Loader2, Heart, Linkedin } from 'lucide-react';
import Footer from '@/components/Footer';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel';
import Autoplay from 'embla-carousel-autoplay';
import { useRef } from 'react';

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { signIn, signUp, user } = useAuth();
  const navigate = useNavigate();
  const autoplayPlugin = useRef(
    Autoplay({ delay: 3000, stopOnInteraction: false, stopOnMouseEnter: true })
  );

  const supporters = [
    {
      name: "Sadia Saad",
      image: supporterSadiaSaad,
      role: "Speridian Technologies",
      position: "Associate Business Analyst · Full-time",
      testimonial: "A great initiative that will transform recruitment processes",
      initials: "SS",
      linkedin: "https://www.linkedin.com/in/sadia-saad/"
    },
    {
      name: "Komal Waheed",
      image: supporterKomalWaheed,
      role: "UNFPRA",
      position: "Partnership Developer and Consultant",
      testimonial: "Inspiring work that empowers organizations to find the right talent",
      initials: "KW",
      linkedin: "https://www.linkedin.com/in/komal-waheed/"
    },
    {
      name: "Mahnoor Javeed",
      image: supporterMahnoorJaveed,
      role: "Airbosoft",
      position: "HR and Talent Management Executive · Full-time",
      testimonial: "Supporting innovative solutions that revolutionize talent acquisition",
      initials: "MJ",
      linkedin: "https://www.linkedin.com/in/mahnoor-jawed-48628b17b/"
    }
  ];

  useEffect(() => {
    if (user) {
      navigate('/');
    }
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    if (isLogin) {
      await signIn(email, password);
    } else {
      await signUp(email, password, fullName);
    }

    setIsSubmitting(false);
  };

  return (
    <div className="min-h-screen relative overflow-hidden flex flex-col">
      {/* Animated Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-muted/20">
        <div className="absolute inset-0 bg-mesh" />
        
        {/* Floating Orbs */}
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-primary/20 rounded-full blur-3xl animate-float" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-secondary/20 rounded-full blur-3xl animate-float-delayed" />
        <div className="absolute top-1/2 right-1/3 w-48 h-48 bg-accent/20 rounded-full blur-3xl animate-pulse-glow" />
      </div>
      
      <div className="flex-1 flex items-center justify-center p-4 relative z-10">
        <div className="w-full max-w-md animate-fade-in">
        <div className="text-center mb-10 space-y-4">
          <div className="inline-flex items-center justify-center mb-4 relative">
            <div className="absolute inset-0 bg-primary/20 rounded-full blur-3xl animate-pulse-glow" />
            <img src={adiLinkLogo} alt="AdiLink Logo" className="h-44 md:h-52 w-auto relative z-10 drop-shadow-2xl" />
          </div>
          <h1 className="text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary via-secondary to-accent">AdiLink</h1>
          <p className="text-muted-foreground text-lg font-medium">AI-Powered Recruitment Platform</p>
        </div>

        <Card className="shadow-[var(--shadow-premium)] backdrop-blur-sm bg-card/95 border-primary/20 hover:shadow-[var(--shadow-glow)] transition-all duration-300">
          <Tabs value={isLogin ? 'login' : 'signup'} onValueChange={(v) => setIsLogin(v === 'login')}>
            <CardHeader>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  Login
                </TabsTrigger>
                <TabsTrigger value="signup" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  Sign Up
                </TabsTrigger>
              </TabsList>
            </CardHeader>

            <form onSubmit={handleSubmit}>
              <CardContent className="space-y-4">
                <TabsContent value="login" className="space-y-4 mt-0">
                  <div className="space-y-2 animate-slide-in-left">
                    <Label htmlFor="login-email">Email</Label>
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="your@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2 animate-slide-in-left" style={{ animationDelay: '0.1s' }}>
                    <Label htmlFor="login-password">Password</Label>
                    <Input
                      id="login-password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                </TabsContent>

                <TabsContent value="signup" className="space-y-4 mt-0">
                  <div className="space-y-2 animate-slide-in-right">
                    <Label htmlFor="signup-name">Full Name</Label>
                    <Input
                      id="signup-name"
                      type="text"
                      placeholder="Adil Munawar"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required={!isLogin}
                    />
                  </div>
                  <div className="space-y-2 animate-slide-in-right" style={{ animationDelay: '0.1s' }}>
                    <Label htmlFor="signup-email">Email</Label>
                    <Input
                      id="signup-email"
                      type="email"
                      placeholder="Adil@Nexus.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2 animate-slide-in-right" style={{ animationDelay: '0.2s' }}>
                    <Label htmlFor="signup-password">Password</Label>
                    <Input
                      id="signup-password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                </TabsContent>
              </CardContent>

              <CardFooter>
                <Button 
                  type="submit" 
                  className="w-full bg-gradient-to-r from-primary to-secondary hover:opacity-90 transition-opacity"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Please wait
                    </>
                  ) : (
                    isLogin ? 'Sign In' : 'Create Account'
                  )}
                </Button>
              </CardFooter>
            </form>
          </Tabs>
        </Card>

        <p className="text-center text-sm text-muted-foreground mt-4">
          By continuing, you agree to our Terms of Service and Privacy Policy
        </p>

        {/* Supporters Section */}
        <Card className="mt-8 shadow-[var(--shadow-card)] backdrop-blur-sm bg-card/95 border-primary/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-center justify-center">
              <Heart className="h-5 w-5 text-primary fill-primary" />
              Supporting Adil Munawar's Vision
            </CardTitle>
            <CardDescription className="text-center">
              Dedicated supporters making AdiLink possible
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Carousel
              opts={{
                align: "start",
                loop: true,
              }}
              plugins={[autoplayPlugin.current]}
              className="w-full max-w-md mx-auto"
              onMouseEnter={autoplayPlugin.current.stop}
              onMouseLeave={autoplayPlugin.current.reset}
            >
              <CarouselContent>
                {supporters.map((supporter, index) => (
                  <CarouselItem key={index}>
                    <div className="flex flex-col items-center space-y-4 p-4">
                      <Avatar className="h-24 w-24 border-2 border-primary/20">
                        <AvatarImage src={supporter.image} alt={supporter.name} />
                        <AvatarFallback>{supporter.initials}</AvatarFallback>
                      </Avatar>
                      <div className="text-center space-y-2">
                        <h3 className="font-semibold text-lg">{supporter.name}</h3>
                        <p className="text-sm text-muted-foreground">
                          {supporter.role}<br />
                          {supporter.position}
                        </p>
                        <p className="text-sm italic text-foreground/80 max-w-md">
                          "{supporter.testimonial}"
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Support: Not disclosed
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-2"
                          onClick={() => window.open(supporter.linkedin, '_blank')}
                        >
                          <Linkedin className="h-4 w-4 mr-2" />
                          View LinkedIn Profile
                        </Button>
                      </div>
                    </div>
                  </CarouselItem>
                ))}
              </CarouselContent>
              <CarouselPrevious className="left-0" />
              <CarouselNext className="right-0" />
            </Carousel>
          </CardContent>
        </Card>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default Auth;

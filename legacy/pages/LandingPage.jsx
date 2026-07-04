import React from 'react';
import Navbar from '../components/Navbar'
import Hero from '../components/Hero'
import Services from '../components/Services'
import Departments from '../components/Departments'
import DoctorsShowcase from '../components/DoctorsShowcase'
import AppointmentCTA from '../components/AppointmentCTA'
import HowItWorks from '../components/HowItWorks'
import Footer from '../components/Footer'

export default function LandingPage() {
  return (
    <div className="relative min-h-screen bg-background text-text">
      <Navbar />
      <Hero />
      <Services />
      <Departments />
      <DoctorsShowcase />
      <AppointmentCTA />
      <HowItWorks />
      <Footer />
    </div>
  );
}

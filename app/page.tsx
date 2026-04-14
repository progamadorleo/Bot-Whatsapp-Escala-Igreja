import Link from "next/link"
import { Calendar, Users, LayoutDashboard, UserX, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/10">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-12 text-center">
          <h1 className="mb-4 text-5xl font-bold text-balance">Sistema de Escalas - Ministério de Mídia</h1>
          <p className="text-xl text-muted-foreground text-pretty">
            Gerencie as escalas do seu ministério de forma automática e eficiente
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3 mb-8">
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-lg bg-primary/10">
                  <Users className="h-6 w-6 text-primary" />
                </div>
                <CardTitle>Membros</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <CardDescription className="mb-4">
                Cadastre e gerencie os membros do ministério com sistema de avaliação por estrelas
              </CardDescription>
              <Link href="/members">
                <Button className="w-full">Gerenciar Membros</Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-lg bg-secondary/10">
                  <Calendar className="h-6 w-6 text-secondary" />
                </div>
                <CardTitle>Cultos</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <CardDescription className="mb-4">
                Cadastre os cultos do mês e defina o nível de importância de cada um
              </CardDescription>
              <Link href="/cultos">
                <Button variant="secondary" className="w-full">
                  Gerenciar Cultos
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-lg bg-accent">
                  <LayoutDashboard className="h-6 w-6 text-accent-foreground" />
                </div>
                <CardTitle>Escala</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <CardDescription className="mb-4">
                Visualize a escala completa do mês e faça ajustes quando necessário
              </CardDescription>
              <Link href="/schedule">
                <Button variant="outline" className="w-full bg-transparent">
                  Ver Escala
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-lg bg-destructive/10">
                  <UserX className="h-6 w-6 text-destructive" />
                </div>
                <CardTitle>Indisponibilidades</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <CardDescription className="mb-4">
                Veja quais membros não poderão servir nos cultos cadastrados
              </CardDescription>
              <Link href="/unavailable">
                <Button variant="destructive" className="w-full">
                  Ver Indisponibilidades
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-lg bg-green-500/10">
                  <Save className="h-6 w-6 text-green-600" />
                </div>
                <CardTitle>Escalas Salvas</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <CardDescription className="mb-4">
                Acesse o histórico de escalas geradas e exporte para PDF
              </CardDescription>
              <Link href="/saved-schedules">
                <Button variant="outline" className="w-full bg-transparent">
                  Ver Escalas Salvas
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-primary/5 border-primary/20">
          <CardHeader>
            <CardTitle className="text-2xl">Como funciona?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                1
              </div>
              <div>
                <h3 className="font-semibold mb-1">Cadastre os membros</h3>
                <p className="text-muted-foreground">
                  Adicione os membros do ministério e classifique-os de 1 a 5 estrelas conforme a experiência
                </p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                2
              </div>
              <div>
                <h3 className="font-semibold mb-1">Cadastre os cultos</h3>
                <p className="text-muted-foreground">
                  Adicione os cultos do mês com data, hora e defina quantas estrelas são necessárias para cada um
                </p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                3
              </div>
              <div>
                <h3 className="font-semibold mb-1">Gere a escala automaticamente</h3>
                <p className="text-muted-foreground">
                  O sistema irá alocar automaticamente os membros adequados para cada culto baseado nas estrelas
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

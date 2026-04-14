"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { db } from "@/lib/firebase"
import { collection, addDoc, getDocs, updateDoc, deleteDoc, doc } from "firebase/firestore"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Star, Trash2, Edit2, Plus, ArrowLeft, Camera, Pencil } from "lucide-react"
import Link from "next/link"
import type { Member } from "@/lib/types"

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingMember, setEditingMember] = useState<Member | null>(null)
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    stars: 3,
    roles: {
      fotografo: false,
      editor: false,
    },
  })

  useEffect(() => {
    loadMembers()
  }, [])

  async function loadMembers() {
    try {
      const querySnapshot = await getDocs(collection(db, "members"))
      const membersData = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Member[]
      setMembers(membersData.sort((a, b) => b.stars - a.stars))
    } catch (error) {
      console.error("Erro ao carregar membros:", error)
    } finally {
      setIsLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!formData.roles.fotografo && !formData.roles.editor) {
      alert("Por favor, selecione pelo menos um cargo (Fotógrafo ou Editor)")
      return
    }

    try {
      if (editingMember) {
        const memberRef = doc(db, "members", editingMember.id)
        await updateDoc(memberRef, {
          name: formData.name,
          phone: formData.phone,
          stars: formData.stars,
          roles: formData.roles,
        })
      } else {
        await addDoc(collection(db, "members"), {
          name: formData.name,
          phone: formData.phone,
          stars: formData.stars,
          roles: formData.roles,
          createdAt: new Date().toISOString(),
        })
      }

      setFormData({ name: "", phone: "", stars: 3, roles: { fotografo: false, editor: false } })
      setShowForm(false)
      setEditingMember(null)
      loadMembers()
    } catch (error) {
      console.error("Erro ao salvar membro:", error)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Tem certeza que deseja excluir este membro?")) return

    try {
      await deleteDoc(doc(db, "members", id))
      loadMembers()
    } catch (error) {
      console.error("Erro ao excluir membro:", error)
    }
  }

  function handleEdit(member: Member) {
    setEditingMember(member)
    setFormData({
      name: member.name,
      phone: member.phone,
      stars: member.stars,
      roles: member.roles || { fotografo: false, editor: false },
    })
    setShowForm(true)
  }

  function cancelForm() {
    setShowForm(false)
    setEditingMember(null)
    setFormData({ name: "", phone: "", stars: 3, roles: { fotografo: false, editor: false } })
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="outline" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-4xl font-bold text-foreground">Membros</h1>
              <p className="text-muted-foreground mt-1">Gerencie os integrantes do ministério</p>
            </div>
          </div>

          {!showForm && (
            <Button onClick={() => setShowForm(true)} size="lg">
              <Plus className="mr-2 h-5 w-5" />
              Novo Membro
            </Button>
          )}
        </div>

        {/* Form */}
        {showForm && (
          <Card className="p-6 mb-8 border-2">
            <h2 className="text-2xl font-semibold mb-6">{editingMember ? "Editar Membro" : "Novo Membro"}</h2>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium mb-2">Nome Completo</label>
                <Input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: João Silva"
                  required
                  className="text-base"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Telefone</label>
                <Input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="Ex: (11) 98765-4321"
                  required
                  className="text-base"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-3">Cargos</label>
                <div className="space-y-3">
                  <label className="flex items-center gap-3 p-4 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                    <input
                      type="checkbox"
                      checked={formData.roles.fotografo}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          roles: { ...formData.roles, fotografo: e.target.checked },
                        })
                      }
                      className="h-4 w-4"
                    />
                    <Camera className="h-5 w-5 text-primary" />
                    <div>
                      <p className="font-medium">Fotógrafo</p>
                      <p className="text-xs text-muted-foreground">Responsável por capturar fotos do culto</p>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 p-4 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                    <input
                      type="checkbox"
                      checked={formData.roles.editor}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          roles: { ...formData.roles, editor: e.target.checked },
                        })
                      }
                      className="h-4 w-4"
                    />
                    <Pencil className="h-5 w-5 text-primary" />
                    <div>
                      <p className="font-medium">Editor</p>
                      <p className="text-xs text-muted-foreground">Responsável por editar fotos e vídeos</p>
                    </div>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Nível de Experiência</label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setFormData({ ...formData, stars: star })}
                      className="transition-transform hover:scale-110"
                    >
                      <Star
                        className={`h-10 w-10 ${
                          star <= formData.stars ? "fill-yellow-400 text-yellow-400" : "text-gray-300"
                        }`}
                      />
                    </button>
                  ))}
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  {formData.stars === 5 && "★★★★★ Especialista - Para cultos especiais"}
                  {formData.stars === 4 && "★★★★☆ Avançado - Alta confiabilidade"}
                  {formData.stars === 3 && "★★★☆☆ Intermediário - Cultos regulares"}
                  {formData.stars === 2 && "★★☆☆☆ Iniciante - Em desenvolvimento"}
                  {formData.stars === 1 && "★☆☆☆☆ Novato - Precisa de supervisão"}
                </p>
              </div>

              <div className="flex gap-3">
                <Button type="submit" className="flex-1">
                  {editingMember ? "Atualizar" : "Cadastrar"}
                </Button>
                <Button type="button" variant="outline" onClick={cancelForm} className="flex-1 bg-transparent">
                  Cancelar
                </Button>
              </div>
            </form>
          </Card>
        )}

        {/* Members List */}
        {isLoading ? (
          <div className="text-center py-12">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
            <p className="mt-4 text-muted-foreground">Carregando membros...</p>
          </div>
        ) : members.length === 0 ? (
          <Card className="p-12 text-center">
            <p className="text-muted-foreground text-lg">Nenhum membro cadastrado ainda.</p>
            <Button onClick={() => setShowForm(true)} className="mt-4">
              Cadastrar Primeiro Membro
            </Button>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {members.map((member) => (
              <Card key={member.id} className="p-6 hover:shadow-lg transition-shadow">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg text-foreground mb-1">{member.name}</h3>
                    <p className="text-sm text-muted-foreground">{member.phone}</p>
                    <div className="flex gap-2 mt-2">
                      {member.roles?.fotografo && (
                        <span className="flex items-center gap-1 text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
                          <Camera className="h-3 w-3" />
                          Fotógrafo
                        </span>
                      )}
                      {member.roles?.editor && (
                        <span className="flex items-center gap-1 text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full">
                          <Pencil className="h-3 w-3" />
                          Editor
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(member)}>
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(member.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>

                <div className="flex gap-1 mt-3">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className={`h-5 w-5 ${
                        star <= member.stars ? "fill-yellow-400 text-yellow-400" : "text-gray-300"
                      }`}
                    />
                  ))}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

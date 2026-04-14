export interface Member {
  id: string
  name: string
  phone: string
  stars: 1 | 2 | 3 | 4 | 5
  roles: {
    fotografo: boolean
    editor: boolean
  }
  createdAt: Date
}

export interface Event {
  id: string
  title: string
  date: string
  time: string
  requiredStars: 1 | 2 | 3 | 4 | 5
  description?: string
  needsFotografos: number
  needsEditores: number
  assignedMembers?: {
    id: string
    name: string
    phone: string
    stars: number
    role: "fotografo" | "editor"
  }[]
  createdAt: Date
}

export interface Unavailability {
  id: string
  memberId: string
  memberName: string
  memberPhone: string
  date: string
  createdAt: string
}

export interface SavedSchedule {
  id: string
  name: string
  month: string
  events: {
    eventId: string
    eventTitle: string
    eventDate: string
    eventTime: string
    assignedMembers: {
      id: string
      name: string
      phone: string
      stars: number
      role: "fotografo" | "editor"
    }[]
  }[]
  createdAt: string
}

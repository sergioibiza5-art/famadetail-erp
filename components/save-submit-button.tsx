"use client"

import { ReactNode } from "react"
import { useFormStatus } from "react-dom"

type SaveSubmitButtonProps = {
  children: ReactNode
  className?: string
  pendingText?: string
}

export function SaveSubmitButton({
  children,
  className,
  pendingText = "A guardar...",
}: SaveSubmitButtonProps) {
  const { pending } = useFormStatus()

  return (
    <button className={className} disabled={pending}>
      {pending ? pendingText : children}
    </button>
  )
}

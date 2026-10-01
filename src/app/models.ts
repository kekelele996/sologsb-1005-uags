export type Role = 'author' | 'examiner' | 'viewer'

export interface Claim {
  id: string
  number: number
  title: string
  text: string
  independent: boolean
}

export interface Paragraph {
  id: string
  section: string
  text: string
}

export interface Feature {
  id: string
  claimId: string
  label: string
  text: string
  parentId: string | null
  referenceIds: string[]
  supportIds: string[]
  ownerRole: Role
}

export interface Annotation {
  id: string
  featureId: string
  authorRole: Role
  authorName: string
  text: string
  updatedAt: string
}

export interface OrphanMapping {
  id: string
  featureLabel: string
  paragraphId: string
  reason: string
}

export interface ClaimVersion {
  id: string
  name: string
  createdAt: string
  claims: Claim[]
  features: Feature[]
}

export interface Position {
  tab: string
  claimId: string
  featureId: string | null
  scrollY: number
}

export interface WorkbenchState {
  claims: Claim[]
  paragraphs: Paragraph[]
  features: Feature[]
  annotations: Annotation[]
  orphanMappings: OrphanMapping[]
  versions: ClaimVersion[]
  officeActions: OfficeAction[]
  role: Role
  selectedClaimId: string
  selectedFeatureId: string | null
  activeTab: string
  currentUserRole: Role
}

export interface ValidationIssue {
  id: string
  severity: 'error' | 'warning'
  type: 'cycle' | 'missing-support' | 'orphan-mapping' | 'empty-feature' | 'office-action'
  featureId?: string
  title: string
  detail: string
}

// 审查意见
export interface OfficeAction {
  id: string
  name: string
  documentNumber: string
  issuedAt: string
  createdAt: string
  items: DefectItem[]
  reconciled: boolean
  reconciledAt: string | null
  finalized: boolean
  finalizedAt: string | null
}

// 缺陷条目
export interface DefectItem {
  id: string
  officeActionId: string
  sequence: number
  claimId: string | null
  featureId: string | null
  text: string
  conclusion: 'upheld' | 'rejected' | 'pending'
  conclusionInvalid: boolean
  matched: boolean
  response: Response | null
}

// 答复
export interface Response {
  id: string
  defectItemId: string
  type: 'amendment' | 'argument'
  text: string
  basis: string
  amendedFeatureId: string | null
  amendedFromText: string | null
  status: 'complete' | 'incomplete'
  createdAt: string
  updatedAt: string
}

// 对账结果
export interface ReconcileResult {
  matched: number
  unmatched: number
  total: number
  items: Array<{ itemId: string; matched: boolean; claimId: string | null; featureId: string | null; reason: string }>
}

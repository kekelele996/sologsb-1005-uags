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

export type DefectType = 'novelty' | 'inventive-step' | 'clarity' | 'support' | 'formal' | 'other'
export type ReplyMode = 'amend' | 'argue'
export type ReplyStatus = 'complete' | 'incomplete' | 'unclaimed'

/** 审查员一侧的记录（审查意见原文、编号、审查结论），重传同一份意见时只覆盖这一侧 */
export interface ExaminerSideItem {
  remoteKey: string
  defectNo: string
  defectType: DefectType
  opinionText: string
  conclusion: string
  /** 审查结论所挂的原始指向；自动对账失败时进入待认领 */
  suggestedClaimNumber: number | null
  suggestedFeatureLabel: string | null
}

/** 工作台一侧的记录（认领关系、代理人答复、依据、定稿状态） */
export interface WorkbenchSideItem {
  claimId: string | null
  featureId: string | null
  replyMode: ReplyMode | null
  replyText: string
  basisSupportIds: string[]
  /** 认领/上一次对账时的特征正文快照，用于判定“已改”是否真的动过这条特征 */
  baselineFeatureText: string | null
  /** 特征在本次意见之后被改动过，审查员先前结论即失效 */
  conclusionStale: boolean
  finalized: boolean
}

export interface OfficeActionItem {
  id: string
  examiner: ExaminerSideItem
  workbench: WorkbenchSideItem
  createdAt: string
  updatedAt: string
}

export interface OfficeAction {
  id: string
  /** 审查意见文件的去重键：同一份意见再送不重复建 */
  remoteId: string
  title: string
  receivedAt: string
  items: OfficeActionItem[]
  export: { finalizedAt: string; csv: string } | null
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
  type: 'cycle' | 'missing-support' | 'orphan-mapping' | 'empty-feature'
  featureId?: string
  title: string
  detail: string
}

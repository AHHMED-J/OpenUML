/**
 * OpenUML's own icon set: small inline SVGs (16×16 grid) for element types, toolbox tools and
 * toolbar buttons. Strokes use `currentColor`; a few accent fills come from CSS variables so
 * they adapt to the theme.
 */
import type React from 'react'

const A = {
  classifier: 'var(--icon-classifier)',
  pkg: 'var(--icon-package)',
  diagram: 'var(--icon-diagram)',
  feature: 'var(--icon-feature)',
  behavior: 'var(--icon-behavior)',
  usecase: 'var(--icon-usecase)'
}

interface SvgProps {
  readonly size?: number
  readonly title?: string
  readonly className?: string
  readonly children?: React.ReactNode
}

function Svg({ size = 16, title, className, children }: SvgProps): React.JSX.Element {
  return (
    <svg
      className={className ?? 'icon'}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  )
}

/** Class-like box with name bar and compartments. */
const box = (fill: string, compartments = 2, label?: string): React.ReactNode => (
  <>
    <rect x={2} y={2.5} width={12} height={11} rx={1} fill={fill} fillOpacity={0.35} />
    <line x1={2} y1={6} x2={14} y2={6} />
    {compartments > 1 ? <line x1={2} y1={9.5} x2={14} y2={9.5} /> : null}
    {label ? (
      <text x={8} y={5.3} fontSize={3.4} textAnchor="middle" stroke="none" fill="currentColor">
        {label}
      </text>
    ) : null}
  </>
)

const folder = (fill: string, mark?: React.ReactNode): React.ReactNode => (
  <>
    <path d="M2 4.5h4.5l1-1.5H2z" fill={fill} fillOpacity={0.5} />
    <rect x={2} y={4.5} width={12} height={9} rx={0.8} fill={fill} fillOpacity={0.35} />
    {mark}
  </>
)

const diagramIcon = (inner: React.ReactNode): React.ReactNode => (
  <>
    <rect x={1.5} y={2} width={13} height={12} rx={1.5} fill={A.diagram} fillOpacity={0.25} />
    {inner}
  </>
)

const featureRow = (mark: React.ReactNode): React.ReactNode => (
  <>
    {mark}
    <line x1={7} y1={8} x2={14} y2={8} />
  </>
)

const controlCircle = (fill: boolean, ring = false, cross = false): React.ReactNode => (
  <>
    <circle cx={8} cy={8} r={ring ? 5.5 : 4.5} fill={fill && !ring ? 'currentColor' : 'none'} />
    {ring ? <circle cx={8} cy={8} r={3} fill="currentColor" /> : null}
    {cross ? <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" /> : null}
  </>
)

const diamond = <path d="M8 2.5l5 5.5-5 5.5-5-5.5z" />

function relationshipGlyph(kind: string): React.ReactNode {
  switch (kind) {
    case 'IDEF0Arrow':
      return (
        <>
          <line x1={2} y1={8} x2={13} y2={8} />
          <path d="M10 5.5L13.5 8 10 10.5z" fill="currentColor" />
        </>
      )
    case 'IDEF0Call':
      return (
        <>
          <line x1={8} y1={2.5} x2={8} y2={12.5} />
          <path d="M5.5 10L8 13.5 10.5 10z" fill="currentColor" />
        </>
      )
    case 'Generalization':
      return (
        <>
          <line x1={2} y1={14} x2={9.5} y2={6.5} />
          <path d="M8 4l4-0.5L11.5 8z" fill="var(--surface)" />
        </>
      )
    case 'InterfaceRealization':
    case 'ComponentRealization':
    case 'Realization':
      return (
        <>
          <line x1={2} y1={14} x2={9.5} y2={6.5} strokeDasharray="1.6 1.4" />
          <path d="M8 4l4-0.5L11.5 8z" fill="var(--surface)" />
        </>
      )
    case 'Containment':
      return (
        <>
          <line x1={2} y1={14} x2={10} y2={6} />
          <circle cx={11.5} cy={4.5} r={2.8} fill="var(--surface)" />
          <path d="M11.5 3.1v2.8M10.1 4.5h2.8" />
        </>
      )
    case 'Extension':
      return (
        <>
          <line x1={2} y1={14} x2={10} y2={6} />
          <path d="M8 4l4-0.5L11.5 8z" fill="currentColor" />
        </>
      )
    case 'Dependency':
    case 'Deployment':
    case 'RoleBinding':
    case 'InformationFlow':
    case 'Include':
    case 'Extend':
    case 'NoteLink':
      return (
        <>
          <line x1={2} y1={14} x2={12.5} y2={3.5} strokeDasharray="1.6 1.4" />
          {kind === 'NoteLink' ? null : <path d="M8.5 3.5h4v4" />}
        </>
      )
    case 'DirectedAssociation':
    case 'DirectedLink':
      return (
        <>
          <line x1={2} y1={14} x2={12.5} y2={3.5} />
          <path d="M8.5 3.5h4v4" />
        </>
      )
    case 'Aggregation':
    case 'Composition':
      return (
        <>
          <line x1={2} y1={14} x2={9} y2={7} />
          <path d="M9 7l0.3-3.7L13 3l-0.3 3.7z" fill={kind === 'Composition' ? 'currentColor' : 'var(--surface)'} />
        </>
      )
    case 'ControlFlow':
    case 'ObjectFlow':
    case 'Transition':
    case 'TimingMessage':
    case 'CommForwardMessage':
    case 'CommReverseMessage':
    case 'Message':
      return (
        <>
          <line x1={2} y1={8} x2={13.5} y2={8} />
          <path d="M10.5 5.5L13.5 8l-3 2.5" fill={kind === 'Message' ? 'currentColor' : 'none'} />
        </>
      )
    default:
      return <line x1={2} y1={14} x2={14} y2={2} />
  }
}

function typeGlyph(type: string): React.ReactNode {
  switch (type) {
    case 'Project':
      return (
        <>
          <path d="M3 2.5h7l3 3v8H3z" fill={A.pkg} fillOpacity={0.3} />
          <path d="M10 2.5v3h3" />
        </>
      )
    case 'UMLModel':
      return folder(A.pkg, <path d="M8 7l2.5 1.5v3L8 13l-2.5-1.5v-3z" />)
    case 'UMLPackage':
    case 'UMLSubsystem':
      return folder(A.pkg)
    case 'UMLUseCaseSubject':
      return <rect x={2} y={2.5} width={12} height={11} rx={0.5} fill={A.usecase} fillOpacity={0.15} />
    case 'UMLClass':
      return box(A.classifier)
    case 'UMLComponent':
      return (
        <>
          <rect x={4.5} y={2.5} width={9} height={11} fill={A.classifier} fillOpacity={0.35} />
          <rect x={2} y={5} width={5} height={2.4} fill="var(--surface)" />
          <rect x={2} y={9} width={5} height={2.4} fill="var(--surface)" />
        </>
      )
    case 'UMLArtifact':
      return (
        <>
          <path d="M3.5 2h6.5l3 3v9h-9.5z" fill={A.classifier} fillOpacity={0.35} />
          <path d="M10 2v3h3" />
        </>
      )
    case 'UMLNode':
      return (
        <>
          <rect x={2} y={5.5} width={8.5} height={8} fill={A.classifier} fillOpacity={0.35} />
          <path d="M2 5.5l3-3h8.5l-3 3M13.5 2.5v8l-3 3" />
        </>
      )
    case 'UMLProfile':
      return folder(A.pkg, <path d="M5.5 11h5" />)
    case 'UMLStereotype':
      return box(A.classifier, 1, 'S')
    case 'UMLMetaClass':
      return box(A.classifier, 1, 'M')
    case 'UMLComponentRealization':
      return relationshipGlyph('Realization')
    case 'UMLDeployment':
      return relationshipGlyph('Dependency')
    case 'UMLCommunicationPath':
      return relationshipGlyph('Association')
    case 'UMLExtension':
      return relationshipGlyph('Extension')
    case 'UMLInterface':
      return (
        <>
          <circle cx={8} cy={6} r={3.5} fill={A.classifier} fillOpacity={0.35} />
          <line x1={8} y1={9.5} x2={8} y2={14} />
        </>
      )
    case 'UMLDataType':
    case 'UMLPrimitiveType':
      return box(A.classifier, 1, type === 'UMLDataType' ? 'DT' : 'PT')
    case 'UMLEnumeration':
      return box(A.classifier, 1, 'E')
    case 'UMLSignal':
      return <path d="M2 3h9l3 5-3 5H2z" fill={A.classifier} fillOpacity={0.35} />
    case 'UMLEnumerationLiteral':
      return featureRow(<rect x={2.5} y={6} width={3} height={4} fill={A.feature} />)
    case 'UMLAttribute':
      return featureRow(<rect x={2.5} y={6.5} width={3} height={3} fill={A.feature} />)
    case 'UMLOperation':
    case 'UMLReception':
      return featureRow(<circle cx={4} cy={8} r={1.8} fill={A.feature} />)
    case 'UMLParameter':
      return featureRow(<path d="M2.5 6l3 2-3 2z" fill={A.feature} />)
    case 'UMLExtensionPoint':
      return featureRow(<path d="M4 6l2 2-2 2-2-2z" fill={A.feature} />)
    case 'UMLActor':
      return (
        <>
          <circle cx={8} cy={3.8} r={1.8} />
          <path d="M8 5.6v4.4M4.5 7.5h7M8 10l-3 4M8 10l3 4" />
        </>
      )
    case 'UMLUseCase':
      return <ellipse cx={8} cy={8} rx={6} ry={4} fill={A.usecase} fillOpacity={0.35} />
    case 'UMLCollaboration':
      return <ellipse cx={8} cy={8} rx={6} ry={4} strokeDasharray="1.6 1.2" />
    case 'UMLInteraction':
      return (
        <>
          <rect x={2} y={2.5} width={12} height={11} rx={1} fill={A.behavior} fillOpacity={0.2} />
          <path d="M2 5.5h4l1-1v-2" />
        </>
      )
    case 'UMLLifeline':
      return (
        <>
          <rect x={4} y={2} width={8} height={4} fill={A.behavior} fillOpacity={0.35} />
          <line x1={8} y1={6} x2={8} y2={14} strokeDasharray="1.5 1.2" />
        </>
      )
    case 'UMLMessage':
      return relationshipGlyph('Message')
    case 'UMLCombinedFragment':
    case 'UMLInteractionOperand':
      return (
        <>
          <rect x={2} y={2.5} width={12} height={11} />
          <path d="M2 5.5h4l1-1v-2" />
          {type === 'UMLInteractionOperand' ? null : <line x1={2} y1={9} x2={14} y2={9} strokeDasharray="1.5 1.2" />}
        </>
      )
    case 'UMLActivity':
      return <rect x={2} y={3} width={12} height={10} rx={3} fill={A.behavior} fillOpacity={0.2} />
    case 'UMLAction':
      return <rect x={2} y={4} width={12} height={8} rx={3} fill={A.behavior} fillOpacity={0.35} />
    case 'UMLObjectNode':
      return <rect x={2} y={4} width={12} height={8} fill={A.behavior} fillOpacity={0.2} />
    case 'UMLInitialNode':
      return controlCircle(true)
    case 'UMLActivityFinalNode':
      return controlCircle(false, true)
    case 'UMLFlowFinalNode':
      return controlCircle(false, false, true)
    case 'UMLForkNode':
    case 'UMLJoinNode':
      return <rect x={2} y={6.8} width={12} height={2.4} fill="currentColor" />
    case 'UMLDecisionNode':
    case 'UMLMergeNode':
      return diamond
    case 'UMLActivityPartition':
      return (
        <>
          <rect x={2} y={2} width={12} height={12} />
          <line x1={2} y1={5} x2={14} y2={5} />
          <line x1={8} y1={2} x2={8} y2={14} />
        </>
      )
    case 'UMLInputPin':
    case 'UMLOutputPin':
      return (
        <>
          <rect x={5} y={5} width={6} height={6} />
          <path d={type === 'UMLInputPin' ? 'M1.5 8h3' : 'M11 8h3.5'} />
        </>
      )
    case 'UMLControlFlow':
    case 'UMLObjectFlow':
      return relationshipGlyph('ControlFlow')
    case 'UMLAssociation':
      return relationshipGlyph('Association')
    case 'UMLGeneralization':
      return relationshipGlyph('Generalization')
    case 'UMLDependency':
    case 'UMLInclude':
    case 'UMLExtend':
      return relationshipGlyph('Dependency')
    case 'UMLRealization':
    case 'UMLInterfaceRealization':
      return relationshipGlyph('Realization')
    case 'UMLConstraint':
      return (
        <text x={8} y={11.5} fontSize={9} textAnchor="middle" stroke="none" fill="currentColor">
          {'{ }'}
        </text>
      )
    case 'UMLClassDiagram':
      return diagramIcon(
        <>
          <rect x={4} y={4.5} width={4} height={3.5} />
          <rect x={8.5} y={9} width={4} height={3.5} />
          <path d="M8 6.2h2.5V9" />
        </>
      )
    case 'UMLUseCaseDiagram':
      return diagramIcon(<ellipse cx={8} cy={8} rx={4} ry={2.6} />)
    case 'UMLSequenceDiagram':
      return diagramIcon(
        <>
          <path d="M5 4v8M11 4v8" strokeDasharray="1.2 1" />
          <path d="M5 7h6M9.5 5.8L11 7 9.5 8.2" />
        </>
      )
    case 'UMLComponentDiagram':
      return diagramIcon(
        <>
          <rect x={6} y={4.5} width={5.5} height={7} />
          <rect x={4.5} y={6} width={3} height={1.6} />
          <rect x={4.5} y={8.8} width={3} height={1.6} />
        </>
      )
    case 'UMLDeploymentDiagram':
      return diagramIcon(
        <>
          <rect x={4.5} y={6.5} width={5} height={5} />
          <path d="M4.5 6.5l2-2h5l-2 2M11.5 4.5v5l-2 2" />
        </>
      )
    case 'UMLPackageDiagram':
      return diagramIcon(<path d="M4.5 5.5h3v1.5h4.5v4.5h-7.5z" />)
    case 'UMLProfileDiagram':
      return diagramIcon(
        <>
          <path d="M4.5 5.5h3v1.5h4.5v4.5h-7.5z" />
          <path d="M6.5 9.5h3" />
        </>
      )
    case 'UMLActivityDiagram':
      return diagramIcon(
        <>
          <circle cx={8} cy={4.6} r={1.2} fill="currentColor" />
          <rect x={5} y={7} width={6} height={3} rx={1.3} />
          <path d="M8 5.8V7M8 10v1.6" />
        </>
      )
    case 'UMLStateMachine':
      return (
        <>
          <rect x={2} y={3} width={12} height={10} rx={3} fill={A.behavior} fillOpacity={0.2} />
          <circle cx={5.2} cy={6.4} r={1} fill="currentColor" />
          <path d="M6.2 6.4h3.2" />
        </>
      )
    case 'UMLRegion':
      return <rect x={2.5} y={3} width={11} height={10} strokeDasharray="2 1.4" />
    case 'UMLState':
      return (
        <>
          <rect x={2} y={3.5} width={12} height={9} rx={3} fill={A.behavior} fillOpacity={0.35} />
          <line x1={2.4} y1={7} x2={13.6} y2={7} />
        </>
      )
    case 'UMLFinalState':
      return controlCircle(false, true)
    case 'UMLPseudostate':
    case 'UMLPseudostate.initial':
      return controlCircle(true)
    case 'UMLPseudostate.choice':
      return diamond
    case 'UMLPseudostate.bar':
      return <rect x={2} y={6.8} width={12} height={2.4} rx={1.2} fill="currentColor" />
    case 'UMLPseudostate.junction':
      return <circle cx={8} cy={8} r={3} fill="currentColor" />
    case 'UMLPseudostate.history':
    case 'UMLPseudostate.deepHistory':
      return (
        <>
          <circle cx={8} cy={8} r={5} />
          <text x={8} y={10.4} fontSize={6.5} textAnchor="middle" stroke="none" fill="currentColor">
            {type === 'UMLPseudostate.deepHistory' ? 'H*' : 'H'}
          </text>
        </>
      )
    case 'UMLPseudostate.entryPoint':
      return <circle cx={8} cy={8} r={3.6} />
    case 'UMLPseudostate.exitPoint':
      return (
        <>
          <circle cx={8} cy={8} r={4.4} />
          <path d="M6 6l4 4M10 6l-4 4" />
        </>
      )
    case 'UMLPseudostate.terminate':
      return <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
    case 'UMLConnectionPointReference':
      return <circle cx={8} cy={8} r={3.6} />
    case 'UMLTransition':
      return relationshipGlyph('ControlFlow')
    case 'UMLEvent':
    case 'UMLOpaqueBehavior':
      return <rect x={2} y={4} width={12} height={8} rx={3} fill={A.behavior} fillOpacity={0.2} />
    case 'UMLTimeSegment':
      return <path d="M2 11h5V5h7" />
    case 'UMLTimeTick':
      return <path d="M8 3v6M3 13h10" />
    case 'UMLStatechartDiagram':
      return diagramIcon(
        <>
          <circle cx={4.6} cy={5} r={1} fill="currentColor" />
          <rect x={6} y={6.5} width={6} height={4} rx={1.6} />
          <path d="M5.4 5.6L6.4 7" />
        </>
      )
    case 'UMLTimingDiagram':
      return diagramIcon(<path d="M3.5 10.5h3v-4h3v4h3" />)
    case 'IDEF0Diagram':
      return diagramIcon(
        <>
          <rect x={5.5} y={5.5} width={5} height={4} />
          <path d="M3 7.5h2.5M10.5 7.5H13M8 3.5v2M8 9.5v2" />
        </>
      )
    case 'IDEF0Model':
    case 'IDEF0Function':
      return (
        <>
          <rect x={4} y={4.5} width={8} height={7} fill="var(--surface)" />
          <path d="M1.5 8H4M12 8h2.5M8 2v2.5M8 11.5V14" />
        </>
      )
    case 'IDEF0Port':
      return <rect x={5.5} y={5.5} width={5} height={5} fill="var(--surface)" />
    case 'IDEF0Arrow':
      return relationshipGlyph('IDEF0Arrow')
    case 'IDEF0ModelNote':
      return (
        <>
          <rect x={4} y={4} width={8} height={8} fill="var(--surface)" />
          <text x={8} y={10.2} fontSize={6.5} textAnchor="middle" stroke="none" fill="currentColor">
            1
          </text>
        </>
      )
    case 'RADProcess':
      return (
        <>
          <rect x={2} y={3} width={12} height={10} rx={3} fill={A.behavior} fillOpacity={0.2} />
          <rect x={4.5} y={5.5} width={2.6} height={2.6} />
          <path d="M5.8 8.1v2.6" />
        </>
      )
    case 'RADRole':
      return (
        <>
          <rect x={2.5} y={2.5} width={11} height={11} rx={3} fill="var(--text-muted)" fillOpacity={0.35} />
          <rect x={5.5} y={5} width={2.6} height={2.6} fill="var(--surface)" />
          <path d="M6.8 7.6v3.4" />
        </>
      )
    case 'RADActivity':
      return <rect x={4} y={4} width={8} height={8} fill="var(--surface)" />
    case 'RADInteraction':
      return (
        <>
          <rect x={2.5} y={5} width={5} height={5} fill="var(--surface)" />
          <path d="M7.5 7.5h6.5" strokeWidth={2.2} />
        </>
      )
    case 'RADUndefinedProcess':
      return <ellipse cx={8} cy={8} rx={6} ry={3.6} fill="var(--surface)" />
    case 'RADStateMarker':
      return (
        <>
          <ellipse cx={8} cy={8} rx={6} ry={4} />
          <ellipse cx={8} cy={8} rx={3.4} ry={2} />
        </>
      )
    case 'RADWait':
      return (
        <>
          <path d="M1.5 8h4.5M4.4 6.2L6 8l-1.6 1.8" />
          <circle cx={10} cy={8} r={3.6} fill="var(--surface)" />
        </>
      )
    case 'RADRoleStart':
      return <path d="M3.5 4h4.5l4 4-4 4H3.5z" fill="var(--surface)" />
    case 'RADCaseRefinement':
    case 'RADCaseBranch':
      return (
        <>
          <path d="M5.5 8h5" />
          <circle cx={4} cy={8} r={2.4} fill="var(--surface)" />
          <circle cx={12} cy={8} r={2.4} fill="var(--surface)" />
        </>
      )
    case 'RADPartRefinement':
    case 'RADPartBranch':
      return (
        <>
          <path d="M5.5 8h4.5" />
          <circle cx={4} cy={8} r={2.4} fill="var(--surface)" />
          <path d="M12 5.2l2.4 5.2H9.6z" fill="var(--surface)" />
        </>
      )
    case 'RADStateLine':
      return <path d="M8 2v12" />
    case 'RADInteractionLink':
      return <path d="M2 8h12" strokeWidth={2.4} />
    case 'RADDiagram':
      return diagramIcon(
        <>
          <rect x={4} y={4.5} width={3.4} height={3.4} />
          <path d="M5.7 7.9V11.5M7.4 6.2h3.2" />
          <rect x={10.2} y={5} width={2.4} height={2.4} />
        </>
      )
    case 'UMLObject':
      return (
        <>
          <rect x={2} y={3} width={12} height={10} rx={1} fill={A.classifier} fillOpacity={0.35} />
          <line x1={2} y1={7} x2={14} y2={7} />
          <line x1={4.5} y1={5.6} x2={11.5} y2={5.6} />
        </>
      )
    case 'UMLArtifactInstance':
      return (
        <>
          <path d="M3.5 2h6.5l3 3v9h-9.5z" fill={A.classifier} fillOpacity={0.35} />
          <path d="M10 2v3h3M5.5 11h5" />
        </>
      )
    case 'UMLComponentInstance':
      return (
        <>
          <rect x={4.5} y={2.5} width={9} height={11} fill={A.classifier} fillOpacity={0.35} />
          <rect x={2} y={5} width={5} height={2.4} fill="var(--surface)" />
          <rect x={2} y={9} width={5} height={2.4} fill="var(--surface)" />
          <path d="M8.5 12h4" />
        </>
      )
    case 'UMLNodeInstance':
      return (
        <>
          <rect x={2} y={5.5} width={8.5} height={8} fill={A.classifier} fillOpacity={0.35} />
          <path d="M2 5.5l3-3h8.5l-3 3M13.5 2.5v8l-3 3M4 11.5h4.5" />
        </>
      )
    case 'UMLSlot':
      return featureRow(<rect x={2.5} y={6.5} width={3} height={3} fill={A.feature} />)
    case 'UMLLink':
      return relationshipGlyph('Link')
    case 'UMLConnector':
      return relationshipGlyph('Connector')
    case 'UMLPort':
      return (
        <>
          <rect x={2} y={2.5} width={9} height={11} fill={A.classifier} fillOpacity={0.2} />
          <rect x={9} y={6} width={5} height={5} fill="var(--surface)" />
        </>
      )
    case 'UMLPart':
      return <rect x={2} y={4} width={12} height={8} strokeDasharray="2 1.4" fill={A.classifier} fillOpacity={0.2} />
    case 'UMLCollaborationUse':
      return <ellipse cx={8} cy={8} rx={6} ry={4} strokeDasharray="1.6 1.2" fill={A.behavior} fillOpacity={0.2} />
    case 'UMLRoleBinding':
      return relationshipGlyph('RoleBinding')
    case 'UMLInformationItem':
      return box(A.classifier, 1, 'I')
    case 'UMLInformationFlow':
      return relationshipGlyph('InformationFlow')
    case 'UMLInteractionUse':
      return (
        <>
          <rect x={2} y={3} width={12} height={10} fill={A.behavior} fillOpacity={0.2} />
          <path d="M2 6h4l1-1.5V3" />
        </>
      )
    case 'UMLObjectDiagram':
      return diagramIcon(
        <>
          <rect x={3.5} y={4.5} width={4.5} height={3} />
          <rect x={8.5} y={8.5} width={4.5} height={3} />
          <path d="M6 7.5V10h2.5" />
        </>
      )
    case 'UMLCompositeStructureDiagram':
      return diagramIcon(
        <>
          <rect x={3.5} y={4} width={9} height={8} />
          <rect x={5.5} y={6} width={5} height={4} strokeDasharray="1.2 1" />
          <rect x={2.5} y={7} width={2} height={2} fill="var(--surface)" />
        </>
      )
    case 'UMLCommunicationDiagram':
      return diagramIcon(
        <>
          <rect x={3} y={4} width={4} height={2.6} />
          <rect x={9} y={9.4} width={4} height={2.6} />
          <path d="M6 6.6L10 9.4M7.5 5l2.2 1.6" />
        </>
      )
    case 'UMLInteractionOverviewDiagram':
      return diagramIcon(
        <>
          <circle cx={8} cy={4.4} r={1} fill="currentColor" />
          <rect x={4.5} y={6.4} width={7} height={3} />
          <path d="M8 5.4v1M8 9.4v1.2M6.4 11.6h3.2" />
        </>
      )
    case 'UMLInformationFlowDiagram':
      return diagramIcon(
        <>
          <rect x={3} y={5} width={4} height={3} />
          <rect x={9} y={9} width={4} height={3} />
          <path d="M7 6.5h2.5V9" strokeDasharray="1.2 1" />
        </>
      )
    case 'UMLNoteView':
    case 'Note':
      return <path d="M3 2.5h7l3 3v8H3zM10 2.5v3h3" fill="var(--icon-note)" fillOpacity={0.5} />
    case 'UMLTextView':
    case 'Text':
      return (
        <text x={8} y={12} fontSize={11} textAnchor="middle" stroke="none" fill="currentColor" fontWeight={600}>
          T
        </text>
      )
    default:
      if (type.endsWith('Diagram')) return diagramIcon(null)
      return <rect x={3} y={3} width={10} height={10} rx={2} fill="var(--text-muted)" fillOpacity={0.25} />
  }
}

/** Icon for an element type (`_type`). */
export function TypeIcon({ type, size, title }: { type: string; size?: number; title?: string }): React.JSX.Element {
  return (
    <Svg size={size} title={title}>
      {typeGlyph(type)}
    </Svg>
  )
}

/** Toolbox icon for a NODE_KINDS / EDGE_KINDS key. */
const NODE_KIND_TYPES: Record<string, string> = {
  Class: 'UMLClass',
  Interface: 'UMLInterface',
  Enumeration: 'UMLEnumeration',
  DataType: 'UMLDataType',
  PrimitiveType: 'UMLPrimitiveType',
  Signal: 'UMLSignal',
  Package: 'UMLPackage',
  Model: 'UMLModel',
  Actor: 'UMLActor',
  UseCase: 'UMLUseCase',
  Subject: 'UMLUseCaseSubject',
  Lifeline: 'UMLLifeline',
  CombinedFragment: 'UMLCombinedFragment',
  Endpoint: 'UMLEndpoint',
  Gate: 'UMLGate',
  StateInvariant: 'UMLStateInvariant',
  Continuation: 'UMLContinuation',
  InteractionUse: 'UMLInteractionUse',
  Action: 'UMLAction',
  SendSignal: 'UMLSignal',
  AcceptSignal: 'UMLAction',
  AcceptTimeEvent: 'UMLAction',
  ObjectNode: 'UMLObjectNode',
  InitialNode: 'UMLInitialNode',
  ActivityFinalNode: 'UMLActivityFinalNode',
  FlowFinalNode: 'UMLFlowFinalNode',
  ForkNode: 'UMLForkNode',
  JoinNode: 'UMLJoinNode',
  DecisionNode: 'UMLDecisionNode',
  MergeNode: 'UMLMergeNode',
  Partition: 'UMLActivityPartition',
  HorizontalPartition: 'UMLActivityPartition',
  InputPin: 'UMLInputPin',
  OutputPin: 'UMLOutputPin',
  Object: 'UMLObject',
  ArtifactInstance: 'UMLArtifactInstance',
  ComponentInstance: 'UMLComponentInstance',
  NodeInstance: 'UMLNodeInstance',
  Port: 'UMLPort',
  Part: 'UMLPart',
  Collaboration: 'UMLCollaboration',
  CollaborationUse: 'UMLCollaborationUse',
  CommLifeline: 'UMLLifeline',
  InteractionUseInOverview: 'UMLInteractionUse',
  InteractionInOverview: 'UMLInteraction',
  InformationItem: 'UMLInformationItem',
  Note: 'Note',
  State: 'UMLState',
  CompositeState: 'UMLState',
  OrthogonalState: 'UMLState',
  SubmachineState: 'UMLState',
  InitialState: 'UMLPseudostate.initial',
  Choice: 'UMLPseudostate.choice',
  Join: 'UMLPseudostate.bar',
  Fork: 'UMLPseudostate.bar',
  Junction: 'UMLPseudostate.junction',
  ShallowHistory: 'UMLPseudostate.history',
  DeepHistory: 'UMLPseudostate.deepHistory',
  EntryPoint: 'UMLPseudostate.entryPoint',
  ExitPoint: 'UMLPseudostate.exitPoint',
  Terminate: 'UMLPseudostate.terminate',
  FinalState: 'UMLFinalState',
  ConnectionPointReference: 'UMLConnectionPointReference',
  TimingLifeline: 'UMLLifeline',
  TimingState: 'UMLConstraint',
  TimeSegment: 'UMLTimeSegment',
  TimeTick: 'UMLTimeTick',
  TimeConstraint: 'UMLConstraint',
  DurationConstraint: 'UMLConstraint',
  IDEF0Function: 'IDEF0Function',
  IDEF0ModelNote: 'IDEF0ModelNote',
  Text: 'Text',
  RADRole: 'RADRole',
  RADActivity: 'RADActivity',
  RADInteraction: 'RADInteraction',
  RADUndefinedProcess: 'RADUndefinedProcess',
  RADStateMarker: 'RADStateMarker',
  RADStartMarker: 'RADStateMarker',
  RADEndMarker: 'RADStateMarker',
  RADWait: 'RADWait',
  RADRoleStart: 'RADRoleStart',
  RADExternalRoleStart: 'RADRoleStart',
  RADCaseRefinement: 'RADCaseRefinement',
  RADPartRefinement: 'RADPartRefinement',
  RADCaseBranch: 'RADCaseBranch',
  RADPartBranch: 'RADPartBranch',
  RADStateLine: 'RADStateLine',
  RADInteractionLink: 'RADInteractionLink',
  Component: 'UMLComponent',
  Artifact: 'UMLArtifact',
  Subsystem: 'UMLSubsystem',
  Node: 'UMLNode',
  Profile: 'UMLProfile',
  MetaClass: 'UMLMetaClass',
  Stereotype: 'UMLStereotype'
}

export function ToolIcon({ kind, messageSort, freeEnd }: { kind: string; messageSort?: string; freeEnd?: 'tail' | 'head' }): React.JSX.Element {
  const type = NODE_KIND_TYPES[kind]
  if (type) return <TypeIcon type={type} />
  if (kind === 'Message' && freeEnd) {
    const found = freeEnd === 'tail'
    return (
      <Svg>
        <circle cx={found ? 3.5 : 12.5} cy={8} r={1.8} fill="currentColor" />
        <line x1={found ? 5.5 : 2} y1={8} x2={found ? 13.5 : 10.5} y2={8} />
        <path d={found ? 'M10.5 5.5L13.5 8l-3 2.5' : 'M5 5.5L2 8l3 2.5'} fill="none" />
      </Svg>
    )
  }
  if (kind === 'Message' && messageSort && messageSort !== 'synchCall') {
    const dashed = messageSort === 'reply'
    const open = messageSort !== 'createMessage' && messageSort !== 'deleteMessage'
    return (
      <Svg>
        <line x1={2} y1={8} x2={13.5} y2={8} strokeDasharray={dashed || messageSort === 'createMessage' ? '1.6 1.3' : undefined} />
        <path d="M10.5 5.5L13.5 8l-3 2.5" fill={open ? 'none' : 'currentColor'} />
        {messageSort === 'deleteMessage' ? <path d="M12 3l3 3M15 3l-3 3" /> : null}
      </Svg>
    )
  }
  return <Svg>{relationshipGlyph(kind)}</Svg>
}

export type UiIconName =
  | 'new'
  | 'open'
  | 'save'
  | 'undo'
  | 'redo'
  | 'zoom-in'
  | 'zoom-out'
  | 'fit'
  | 'grid'
  | 'snap'
  | 'palette'
  | 'sidebar'
  | 'navigator'
  | 'close'
  | 'chevron-right'
  | 'chevron-down'
  | 'lock'
  | 'gear'
  | 'plus'
  | 'minus'
  | 'up'
  | 'down'
  | 'pointer'
  | 'ellipsis'
  | 'search'
  | 'export'
  | 'reveal'
  | 'check'

function uiGlyph(name: UiIconName): React.ReactNode {
  switch (name) {
    case 'new':
      return <path d="M4 2h5.5L12 4.5V14H4zM9.5 2v2.5H12M8 7v4M6 9h4" />
    case 'open':
      return <path d="M2 4h4l1.2 1.5H14v7.5H2zM2 7h12" />
    case 'save':
      return <path d="M3 2.5h8.5L13.5 4.5v9H3zM5 2.5v3.5h5V2.5M5 13.5V9.5h6v4" />
    case 'undo':
      return <path d="M5.5 4L2.5 7l3 3M2.5 7h7a3.5 3.5 0 010 7H7" />
    case 'redo':
      return <path d="M10.5 4l3 3-3 3M13.5 7h-7a3.5 3.5 0 000 7H9" />
    case 'zoom-in':
      return <path d="M7 2.5a4.5 4.5 0 110 9 4.5 4.5 0 010-9zM10.3 10.3L14 14M5 7h4M7 5v4" />
    case 'zoom-out':
      return <path d="M7 2.5a4.5 4.5 0 110 9 4.5 4.5 0 010-9zM10.3 10.3L14 14M5 7h4" />
    case 'fit':
      return <path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10M5.5 5.5h5v5h-5z" />
    case 'grid':
      return <path d="M2.5 2.5h11v11h-11zM6.2 2.5v11M9.8 2.5v11M2.5 6.2h11M2.5 9.8h11" strokeWidth={1} />
    case 'snap':
      return (
        <>
          <path d="M2.5 2.5h11v11h-11z" strokeWidth={1} strokeDasharray="1.2 1.6" />
          <path d="M5 11V7a3 3 0 016 0v4M5 9h2M9 9h2" />
        </>
      )
    case 'palette':
      return <path d="M2 3.5h12v9H2zM4.5 7l2 1.5-2 1.5M8 10h3.5" />
    case 'sidebar':
      return <path d="M2 3h12v10H2zM6 3v10" />
    case 'navigator':
      return <path d="M2 3h12v10H2zM10 3v10" />
    case 'close':
      return <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
    case 'chevron-right':
      return <path d="M6 4l4 4-4 4" />
    case 'chevron-down':
      return <path d="M4 6l4 4 4-4" />
    case 'lock':
      return <path d="M4 7.5h8V14H4zM5.8 7.5V5.5a2.2 2.2 0 014.4 0v2" />
    case 'gear':
      return (
        <>
          <circle cx={8} cy={8} r={2.2} />
          <path d="M8 1.8v2M8 12.2v2M1.8 8h2M12.2 8h2M3.6 3.6L5 5M11 11l1.4 1.4M3.6 12.4L5 11M11 5l1.4-1.4" />
        </>
      )
    case 'plus':
      return <path d="M8 3v10M3 8h10" />
    case 'minus':
      return <path d="M3 8h10" />
    case 'up':
      return <path d="M4 9.5L8 5.5l4 4" />
    case 'down':
      return <path d="M4 6.5l4 4 4-4" />
    case 'pointer':
      return <path d="M4 2.5l8 6.2-3.6.6 2.1 4.2-1.5.7-2.1-4.2L4 12.5z" fill="currentColor" fillOpacity={0.15} />
    case 'ellipsis':
      return (
        <>
          <circle cx={3.5} cy={8} r={0.9} fill="currentColor" />
          <circle cx={8} cy={8} r={0.9} fill="currentColor" />
          <circle cx={12.5} cy={8} r={0.9} fill="currentColor" />
        </>
      )
    case 'search':
      return <path d="M7 2.5a4.5 4.5 0 110 9 4.5 4.5 0 010-9zM10.3 10.3L14 14" />
    case 'reveal':
      return <path d="M2 4h4l1.2 1.5H14v7.5H2zM6.5 11.5l3.5-3.5M7.5 8H10v2.5" />
    case 'export':
      return <path d="M8 10V2.5M5 5.5l3-3 3 3M3 9v4.5h10V9" />
    case 'check':
      return <path d="M3.5 8.5l3 3 6-7" />
  }
}

export function UiIcon({ name, size, title }: { name: UiIconName; size?: number; title?: string }): React.JSX.Element {
  return (
    <Svg size={size} title={title}>
      {uiGlyph(name)}
    </Svg>
  )
}

/** Arrow glyphs of the IDEF0 roles, drawn against the box side they attach to. */
function roleGlyph(role: string): React.ReactNode {
  switch (role) {
    case 'input':
      return (
        <>
          <path d="M13 3.5v9" strokeWidth={1.6} />
          <line x1={2} y1={8} x2={9.5} y2={8} />
          <path d="M8 5.5L11 8 8 10.5z" fill="currentColor" />
        </>
      )
    case 'control':
      return (
        <>
          <path d="M3.5 13h9" strokeWidth={1.6} />
          <line x1={8} y1={2} x2={8} y2={9.5} />
          <path d="M5.5 8L8 11l2.5-3z" fill="currentColor" />
        </>
      )
    case 'output':
      return (
        <>
          <path d="M3 3.5v9" strokeWidth={1.6} />
          <line x1={4.5} y1={8} x2={12} y2={8} />
          <path d="M10.5 5.5L13.5 8 10.5 10.5z" fill="currentColor" />
        </>
      )
    case 'mechanism':
      return (
        <>
          <path d="M3.5 3h9" strokeWidth={1.6} />
          <line x1={8} y1={14} x2={8} y2={6.5} />
          <path d="M5.5 8L8 5l2.5 3z" fill="currentColor" />
        </>
      )
    default:
      return (
        <>
          <path d="M3.5 3h9" strokeWidth={1.6} />
          <line x1={8} y1={4.5} x2={8} y2={12} />
          <path d="M5.5 10.5L8 13.5l2.5-3z" fill="currentColor" />
        </>
      )
  }
}

const ROLE_LETTER: Readonly<Record<string, string>> = { input: 'I', control: 'C', output: 'O', mechanism: 'M' }

/**
 * Icon of an IDEF0 role (an arrow entry of the Model Explorer), or of its role folder. Drawn in
 * `currentColor`; the `role-<role>` class gives it the role color.
 */
export function RoleIcon({ role, folder = false, open = false, size }: { role: string; folder?: boolean; open?: boolean; size?: number }): React.JSX.Element {
  const letter = ROLE_LETTER[role]
  return (
    <Svg size={size} className={`icon role-icon role-${role}`}>
      {folder ? (
        <>
          <path d={open ? 'M2 4h4l1.2 1.5H13V7H4.5L2 13z' : 'M2 4h4l1.2 1.5H14v8H2z'} fill="currentColor" fillOpacity={0.18} />
          {open ? <path d="M4.5 7H15l-2.5 6H2z" fill="currentColor" fillOpacity={0.3} /> : null}
          {letter ? (
            <text x={open ? 8.6 : 8} y={11.8} fontSize={5.6} fontWeight={700} textAnchor="middle" stroke="none" fill="currentColor">
              {letter}
            </text>
          ) : (
            <path d={open ? 'M8.6 8v3.4M7.4 10.2l1.2 1.4 1.2-1.4' : 'M8 7.5v4M6.8 10.3L8 11.7l1.2-1.4'} />
          )}
        </>
      ) : (
        roleGlyph(role)
      )}
    </Svg>
  )
}

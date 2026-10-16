export default function Loading() {
  return (
    <div role="status" aria-busy="true">
      <span className="skeleton skeleton--bar" style={{ inlineSize: "40%", blockSize: 16 }} />
    </div>
  );
}

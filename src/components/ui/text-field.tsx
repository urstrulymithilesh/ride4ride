/** A labelled text input with inline error, styled for auth forms. */
export function TextField({
  label,
  name,
  type = "text",
  autoComplete,
  defaultValue,
  placeholder,
  hint,
  error,
  required,
  hideLabel,
  inputMode,
  enterKeyHint,
  autoCapitalize,
  autoCorrect,
}: {
  label: string;
  name: string;
  type?: string;
  autoComplete?: string;
  defaultValue?: string;
  placeholder?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  hideLabel?: boolean;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  enterKeyHint?: "enter" | "done" | "go" | "next" | "previous" | "search" | "send";
  autoCapitalize?: string;
  autoCorrect?: string;
}) {
  const id = `field-${name}`;
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className={`text-sm font-medium text-content ${hideLabel ? "sr-only" : ""}`}
      >
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        inputMode={inputMode}
        enterKeyHint={enterKeyHint}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className="input wrap-anywhere"
      />
      {error ? (
        <p id={`${id}-error`} className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

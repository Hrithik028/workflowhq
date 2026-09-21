import { useEffect, useState } from "react";

interface MfaQrCodeProps {
  otpAuthUri: string;
}

function MfaQrCode({ otpAuthUri }: MfaQrCodeProps) {
  const [imageUrl, setImageUrl] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    import("qrcode")
      .then(({ default: QRCode }) =>
        QRCode.toDataURL(otpAuthUri, {
          errorCorrectionLevel: "M",
          margin: 2,
          width: 240,
          color: { dark: "#0b0f14", light: "#ffffff" }
        })
      )
      .then((url) => {
        if (active) setImageUrl(url);
      })
      .catch(() => {
        if (active) setFailed(true);
      });

    return () => {
      active = false;
    };
  }, [otpAuthUri]);

  if (failed) {
    return (
      <p className="form-alert notice">
        The QR code could not be created. Use the manual setup key below instead.
      </p>
    );
  }

  return (
    <figure className="mfa-qr-code" aria-busy={!imageUrl}>
      {imageUrl ? (
        <img src={imageUrl} alt="QR code for adding WorkflowHQ to an authenticator app" />
      ) : (
        <span className="mfa-qr-placeholder">Creating secure QR code…</span>
      )}
      <figcaption>Scan with your authenticator app</figcaption>
    </figure>
  );
}

export default MfaQrCode;

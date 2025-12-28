function registerRoute({ auth, validate, errors }) {
  return (req, res) => {
    const { install_id: installId, version } = req.body || {};

    if (
      !installId ||
      typeof installId !== "string" ||
      !validate.isValidUuid(installId)
    ) {
      return errors.sendDefinedError(res, "INVALID_REQUEST", "Invalid install_id");
    }

    if (version !== undefined && typeof version !== "string") {
      return errors.sendDefinedError(res, "INVALID_REQUEST", "Invalid version");
    }

    const token = auth.issueInstallToken(installId);
    return res.json({ install_token: token });
  };
}

export { registerRoute };

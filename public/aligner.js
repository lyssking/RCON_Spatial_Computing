window.alignSceneToPoints = function (livePoints, referencePoints, targetEntity) {
    if (livePoints.length < 3 || referencePoints.length < 3) return;

    const pLive = livePoints.map(p => new THREE.Vector3(p.x, p.y, p.z));
    const pRef = referencePoints.map(p => new THREE.Vector3(p.x, p.y, p.z));

    const cLive = new THREE.Vector3();
    const cRef = new THREE.Vector3();
    pLive.forEach(p => cLive.add(p));
    pRef.forEach(p => cRef.add(p));
    cLive.divideScalar(pLive.length);
    cRef.divideScalar(pRef.length);

    const vLive1 = new THREE.Vector3().subVectors(pLive[1], pLive[0]).normalize();
    const vLive2 = new THREE.Vector3().subVectors(pLive[2], pLive[0]).normalize();
    const nLive = new THREE.Vector3().crossVectors(vLive1, vLive2).normalize();

    const vRef1 = new THREE.Vector3().subVectors(pRef[1], pRef[0]).normalize();
    const vRef2 = new THREE.Vector3().subVectors(pRef[2], pRef[0]).normalize();
    const nRef = new THREE.Vector3().crossVectors(vRef1, vRef2).normalize();

    const mLive = new THREE.Matrix4().makeBasis(vLive1, nLive, new THREE.Vector3().crossVectors(vLive1, nLive));
    const mRef = new THREE.Matrix4().makeBasis(vRef1, nRef, new THREE.Vector3().crossVectors(vRef1, nRef));

    const rotationMatrix = new THREE.Matrix4().multiplyMatrices(mRef, mLive.invert());
    const quaternion = new THREE.Quaternion().setFromRotationMatrix(rotationMatrix);

    const offset = cRef.clone().sub(cLive.clone().applyQuaternion(quaternion));

    targetEntity.object3D.position.copy(offset);
    targetEntity.object3D.quaternion.copy(quaternion);

    console.log("[ALIGNMENT COMPLETE] Matrix transformation applied to room mesh.");
};